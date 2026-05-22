import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { eq, desc, sql } from "drizzle-orm";
import crypto from "crypto";

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
  try {
    await db.update(usersTable).set({ biometric_template: biometric_hash, is_verified: true }).where(eq(usersTable.id, req.user!.id));
    res.json({ message: "Biometric enrolled successfully" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to enroll biometric" });
  }
});

export default router;
