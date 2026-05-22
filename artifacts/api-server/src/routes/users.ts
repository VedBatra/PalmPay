import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";
import { isBlacklisted, computeJaccardSimilarity, countActiveBits } from "../lib/biometrics.js";

const router = Router();

export const activeEnrollments = new Map<number, { session_id: string; user_id: number; status: string }>();

router.get("/users/me", requireAuth(["user"]), async (req, res) => {
  try {
    const user = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, req.user!.id) });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      wallet_balance: parseFloat(user.wallet_balance),
      is_verified: user.is_verified,
      biometric_enrolled: !!user.biometric_template,
      created_at: user.created_at,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.get("/users/me/transactions", requireAuth(["user"]), async (req, res) => {
  const page = parseInt(String(req.query.page ?? 1));
  const limit = parseInt(String(req.query.limit ?? 20));
  const offset = (page - 1) * limit;
  try {
    const items = await db
      .select({
        id: transactionsTable.id,
        user_id: transactionsTable.user_id,
        merchant_id: transactionsTable.merchant_id,
        amount: transactionsTable.amount,
        type: transactionsTable.type,
        status: transactionsTable.status,
        razorpay_order_id: transactionsTable.razorpay_order_id,
        timestamp: transactionsTable.timestamp,
        merchant_name: sql<string>`(SELECT shop_name FROM merchants WHERE id = ${transactionsTable.merchant_id})`.as("merchant_name"),
        user_name: sql<string>`(SELECT name FROM users WHERE id = ${transactionsTable.user_id})`.as("user_name"),
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.user_id, req.user!.id))
      .orderBy(desc(transactionsTable.timestamp))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(eq(transactionsTable.user_id, req.user!.id));

    res.json({
      items: items.map((t) => ({ ...t, amount: parseFloat(t.amount) })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.post("/users/me/biometric/initiate", requireAuth(["user"]), async (req, res) => {
  try {
    const session_id = crypto.randomBytes(8).toString("hex");
    // Defaulting to kiosk 1 (matching merchant 1)
    activeEnrollments.set(1, { session_id, user_id: req.user!.id, status: "WAITING" });
    res.json({ session_id, status: "WAITING", message: "Awaiting kiosk palm scan..." });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to initiate biometric enrollment" });
  }
});

router.post("/users/me/biometric/cancel", requireAuth(["user"]), async (req, res) => {
  activeEnrollments.delete(1);
  res.json({ message: "Biometric enrollment cancelled" });
});

router.post("/users/me/biometric", requireAuth(["user"]), async (req, res) => {
  const { biometric_hash } = req.body as { biometric_hash: string };
  if (!biometric_hash) { res.status(400).json({ error: "biometric_hash required" }); return; }

  if (isBlacklisted(biometric_hash)) {
    res.status(400).json({ error: "Invalid biometric scan quality (blank frame detected)" });
    return;
  }

  // Validate active bits quality
  if (biometric_hash && (biometric_hash.length === 256 || biometric_hash.includes(","))) {
    const newTemplates = biometric_hash.split(",");
    for (const newTmpl of newTemplates) {
      const trimmed = newTmpl.trim();
      if (trimmed.length === 256) {
        const activeBits = countActiveBits(trimmed);
        if (activeBits < 50) {
          res.status(400).json({ error: "Invalid biometric scan quality (insufficient details/blank scan)" });
          return;
        }
      }
    }
  }

  try {
    // Collision Check: Ensure this template doesn't collide with any other enrolled user
    if (biometric_hash && (biometric_hash.length === 256 || biometric_hash.includes(","))) {
      const newTemplates = biometric_hash.split(",");
      const allVerified = await db.query.usersTable.findMany({
        where: (u, { and, eq, isNotNull }) => and(
          eq(u.is_verified, true),
          isNotNull(u.biometric_template)
        )
      });

      for (const candidate of allVerified) {
        if (candidate.id === req.user!.id) continue;
        if (!candidate.biometric_template) continue;
        const existingTemplates = candidate.biometric_template.split(",");
        
        for (const newTmpl of newTemplates) {
          const newTrimmed = newTmpl.trim();
          if (newTrimmed.length !== 256) continue;
          
          for (const extTmpl of existingTemplates) {
            const extTrimmed = extTmpl.trim();
            if (extTrimmed.length !== 256) continue;
            
            const score = computeJaccardSimilarity(newTrimmed, extTrimmed);
            if (score >= 0.40) {
              console.log(`[register-biometric] Collision detected! New template matches existing user ${candidate.name} (Score: ${score.toFixed(4)})`);
              res.status(400).json({ error: "Biometric collision detected. This palm is already registered to another account." });
              return;
            }
          }
        }
      }
    }

    await db.update(usersTable).set({ biometric_template: biometric_hash, is_verified: true }).where(eq(usersTable.id, req.user!.id));
    res.json({ message: "Biometric enrolled successfully" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to enroll biometric" });
  }
});

export default router;
