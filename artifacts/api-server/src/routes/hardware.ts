import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, merchantsTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { emitToMerchant, emitToUser } from "../lib/socket.js";
import { activeSessions } from "./merchants.js";
import { activeEnrollments } from "./users.js";

const router = Router();

const BLACKLISTED_HASHES = new Set([
  "22d05d61a54173b13d57f9b57dd9723abf760b038925411e6b98a77bd514bec0", // 2592x1944
  "7818f5542a0404157573be6cffc0e0c8e68ce3c0f5d17d07ccdd9313fb700baf", // 640x480
  "11283ef755895422e6f28b93f3d78cad7539891cf2893c9fdccefb923c5bf70b", // 1920x1080
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  // Empty
]);

function isBlacklisted(hashString: string): boolean {
  if (!hashString) return true;
  const parts = hashString.split(",");
  for (const part of parts) {
    if (BLACKLISTED_HASHES.has(part.trim())) {
      return true;
    }
  }
  return false;
}

function hexToBits(hex: string): boolean[] {
  const bits: boolean[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    for (let bit = 7; bit >= 0; bit--) {
      bits.push(((byte >> bit) & 1) === 1);
    }
  }
  return bits;
}

function computeJaccardSimilarity(hex1: string, hex2: string): number {
  const bits1 = hexToBits(hex1);
  const bits2 = hexToBits(hex2);
  let match = 0;
  let union = 0;
  const length = Math.min(bits1.length, bits2.length);
  for (let i = 0; i < length; i++) {
    if (bits1[i] || bits2[i]) {
      union++;
      if (bits1[i] && bits2[i]) {
        match++;
      }
    }
  }
  if (union === 0) return 0;
  return match / union;
}

router.get("/hardware/active-session/:merchant_id", async (req, res) => {
  const merchant_id = Number(req.params.merchant_id);
  const session = activeSessions.get(merchant_id);
  if (session && session.status === "WAITING") {
    res.json({ active: true, amount: session.amount, session_id: session.session_id });
  } else {
    res.json({ active: false });
  }
});

router.post("/hardware/verify-scan", async (req, res) => {
  let { biometric_hash, merchant_id, amount } = req.body as {
    biometric_hash: string;
    merchant_id: number | string;
    amount: number;
  };
  merchant_id = Number(merchant_id);

  if (!biometric_hash || !merchant_id || !amount) {
    res.status(400).json({ error: "biometric_hash, merchant_id, and amount are required" });
    return;
  }

  if (isBlacklisted(biometric_hash)) {
    res.status(400).json({ error: "Invalid biometric scan quality (blank frame detected)" });
    return;
  }

  try {
    const session = activeSessions.get(merchant_id);
    if (!session || session.status !== "WAITING" || session.amount !== amount) {
      res.status(400).json({ error: "Invalid or expired payment session" });
      return;
    }

    let user = null;

    if (biometric_hash.length !== 256) {
      // 1. Backward-compatible exact match check for unit tests and simulated scans (SHA256 or mock strings)
      user = await db.query.usersTable.findFirst({
        where: (u, { and, eq, or, like }) => and(
          eq(u.is_verified, true),
          or(
            eq(u.biometric_template, biometric_hash),
            like(u.biometric_template, `${biometric_hash},%`),
            like(u.biometric_template, `%,${biometric_hash}`),
            like(u.biometric_template, `%,${biometric_hash},%`)
          )
        )
      });
    } else {
      // 2. Real physical match check using Jaccard Similarity (32x32 Grid, 256 hex chars)
      const allVerified = await db.query.usersTable.findMany({
        where: (u, { and, eq, isNotNull }) => and(
          eq(u.is_verified, true),
          isNotNull(u.biometric_template)
        )
      });

      let bestScore = 0;
      let matchedUser = null;

      for (const candidate of allVerified) {
        if (!candidate.biometric_template) continue;
        const templates = candidate.biometric_template.split(",");
        for (const tmpl of templates) {
          const trimmed = tmpl.trim();
          if (trimmed.length === 256) {
            const score = computeJaccardSimilarity(biometric_hash, trimmed);
            if (score > bestScore) {
              bestScore = score;
              matchedUser = candidate;
            }
          }
        }
      }

      console.log(`[verify-scan] Physical matching completed. Best Jaccard score: ${bestScore.toFixed(4)}`);
      // Calibrated Jaccard threshold: 0.25
      if (bestScore >= 0.25) {
        user = matchedUser;
        console.log(`[verify-scan] Match SUCCESS! User: ${user?.name} (Score: ${bestScore.toFixed(4)})`);
      } else {
        console.log(`[verify-scan] Match FAILED. Best score ${bestScore.toFixed(4)} is below threshold 0.25`);
      }
    }

    if (!user) {
      emitToMerchant(merchant_id, "payment:failed", { error: "Biometric not recognized" });
      res.status(404).json({ error: "No user found matching this biometric" });
      return;
    }

    const merchant = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.id, merchant_id),
    });

    if (!merchant) {
      res.status(404).json({ error: "Merchant not found" });
      return;
    }

    if (parseFloat(user.wallet_balance) < amount) {
      await db.insert(transactionsTable).values({
        user_id: user.id,
        merchant_id,
        amount: String(amount),
        type: "PURCHASE",
        status: "FAILED",
      });
      emitToMerchant(merchant_id, "payment:failed", { error: "Insufficient wallet balance", user_name: user.name });
      emitToUser(user.id, "wallet:updated", { wallet_balance: parseFloat(user.wallet_balance) });
      activeSessions.delete(merchant_id);
      res.status(402).json({ error: "Insufficient wallet balance" });
      return;
    }

    const { updatedUser, updatedMerchant, txn } = await db.transaction(async (tx) => {
      const [u] = await tx
        .update(usersTable)
        .set({ wallet_balance: sql`wallet_balance - ${amount}` })
        .where(eq(usersTable.id, user.id))
        .returning({ wallet_balance: usersTable.wallet_balance });

      const [m] = await tx
        .update(merchantsTable)
        .set({ merchant_balance: sql`merchant_balance + ${amount}` })
        .where(eq(merchantsTable.id, merchant_id))
        .returning({ merchant_balance: merchantsTable.merchant_balance });

      const [t] = await tx.insert(transactionsTable).values({
        user_id: user.id,
        merchant_id,
        amount: String(amount),
        type: "PURCHASE",
        status: "SUCCESS",
      }).returning();

      return { updatedUser: u, updatedMerchant: m, txn: t };
    });

    activeSessions.delete(merchant_id);
    const newBalance = parseFloat(updatedUser.wallet_balance);

    emitToMerchant(merchant_id, "payment:success", {
      amount,
      user_name: user.name,
      transaction_id: txn.id,
      merchant_balance: parseFloat(updatedMerchant.merchant_balance),
    });

    emitToUser(user.id, "wallet:updated", { wallet_balance: newBalance });

    res.json({
      success: true,
      transaction_id: txn.id,
      amount,
      user_name: user.name,
      merchant_name: merchant.shop_name,
      new_balance: newBalance,
    });
  } catch (err) {
    req.log.error(err);
    activeSessions.delete(merchant_id);
    emitToMerchant(merchant_id, "payment:failed", { error: "Server error during payment processing" });
    res.status(500).json({ error: "Payment processing failed" });
  }
});

router.post("/hardware/heartbeat", async (req, res) => {
  const { kiosk_id } = req.body as { kiosk_id: string };
  if (!kiosk_id) { res.status(400).json({ error: "kiosk_id required" }); return; }
  try {
    await db
      .update(merchantsTable)
      .set({ is_online: true, last_seen: new Date() })
      .where(eq(merchantsTable.kiosk_id, kiosk_id));
    res.json({ message: "Heartbeat acknowledged" });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Heartbeat failed" });
  }
});

router.get("/hardware/active-enrollment/:merchant_id", async (req, res) => {
  const merchant_id = Number(req.params.merchant_id);
  const session = activeEnrollments.get(merchant_id);
  if (session && session.status === "WAITING") {
    try {
      const user = await db.query.usersTable.findFirst({
        where: (u, { eq }) => eq(u.id, session.user_id),
      });
      res.json({ active: true, user_name: user?.name || "User", session_id: session.session_id });
    } catch (err) {
      res.status(500).json({ error: "Failed to query enrollment user" });
    }
  } else {
    res.json({ active: false });
  }
});

router.post("/hardware/register-scan", async (req, res) => {
  let { biometric_hash, merchant_id } = req.body as {
    biometric_hash: string;
    merchant_id: number | string;
  };
  merchant_id = Number(merchant_id);

  if (!biometric_hash || !merchant_id) {
    res.status(400).json({ error: "biometric_hash and merchant_id are required" });
    return;
  }

  if (isBlacklisted(biometric_hash)) {
    res.status(400).json({ error: "Invalid biometric scan quality (blank frame detected)" });
    return;
  }

  try {
    const session = activeEnrollments.get(merchant_id);
    if (!session || session.status !== "WAITING") {
      res.status(400).json({ error: "Invalid or expired enrollment session" });
      return;
    }

    // Update the user's template in the DB
    await db.update(usersTable)
      .set({ biometric_template: biometric_hash, is_verified: true })
      .where(eq(usersTable.id, session.user_id));

    activeEnrollments.delete(merchant_id);

    // Notify the user via socket
    emitToUser(session.user_id, "biometric:success", { biometric_hash });

    res.json({ success: true, message: "Biometric enrolled successfully" });
  } catch (err) {
    req.log.error(err);
    activeEnrollments.delete(merchant_id);
    res.status(500).json({ error: "Failed to register scan" });
  }
});

export default router;
