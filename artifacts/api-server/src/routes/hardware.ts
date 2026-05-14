import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, merchantsTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { emitToMerchant, emitToUser } from "../lib/socket.js";

const router = Router();

router.post("/hardware/verify-scan", async (req, res) => {
  const { biometric_hash, merchant_id, amount } = req.body as {
    biometric_hash: string;
    merchant_id: number;
    amount: number;
  };

  if (!biometric_hash || !merchant_id || !amount) {
    res.status(400).json({ error: "biometric_hash, merchant_id, and amount are required" });
    return;
  }

  try {
    const user = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.biometric_template, biometric_hash),
    });

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
      res.status(402).json({ error: "Insufficient wallet balance" });
      return;
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ wallet_balance: sql`wallet_balance - ${amount}` })
      .where(eq(usersTable.id, user.id))
      .returning({ wallet_balance: usersTable.wallet_balance });

    const [updatedMerchant] = await db
      .update(merchantsTable)
      .set({ merchant_balance: sql`merchant_balance + ${amount}` })
      .where(eq(merchantsTable.id, merchant_id))
      .returning({ merchant_balance: merchantsTable.merchant_balance });

    const [txn] = await db.insert(transactionsTable).values({
      user_id: user.id,
      merchant_id,
      amount: String(amount),
      type: "PURCHASE",
      status: "SUCCESS",
    }).returning();

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

export default router;
