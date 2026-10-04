import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

const router = Router();

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";

router.post("/users/me/wallet/topup/order", requireAuth(["user"]), async (req, res) => {
  const { amount } = req.body as { amount: number };
  if (!amount || amount < 10) {
    res.status(400).json({ error: "Minimum top-up amount is ₹10" });
    return;
  }

  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      const fakeOrderId = `order_${crypto.randomBytes(8).toString("hex")}`;
      await db.insert(transactionsTable).values({
        user_id: req.user!.id,
        amount: String(amount),
        type: "TOPUP",
        status: "FAILED",
        razorpay_order_id: fakeOrderId,
      });
      res.status(201).json({
        razorpay_order_id: fakeOrderId,
        amount: Math.round(amount * 100),
        currency: "INR",
        key: "rzp_test_demo",
      });
      return;
    }

    const Razorpay = (await import("razorpay")).default;
    const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: `topup_${req.user!.id}_${Date.now()}`,
    });

    res.status(201).json({
      razorpay_order_id: order.id,
      amount: order.amount as number,
      currency: order.currency,
      key: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

router.post("/users/me/wallet/topup/verify", requireAuth(["user"]), async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };

  try {
    let amount = 0;

    if (!RAZORPAY_KEY_SECRET) {
      const demoAmounts: Record<string, number> = {};
      const txn = await db.query.transactionsTable.findFirst({
        where: (t, { eq }) => eq(t.razorpay_order_id, razorpay_order_id),
      });
      if (txn) {
        amount = parseFloat(txn.amount);
        demoAmounts[razorpay_order_id] = amount || 100;
      }
      amount = amount || 100;
    } else {
      const expectedSig = crypto
        .createHmac("sha256", RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");
      if (expectedSig !== razorpay_signature) {
        res.status(400).json({ error: "Invalid payment signature" });
        return;
      }

      const Razorpay = (await import("razorpay")).default;
      const razorpay = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
      const payment = await razorpay.payments.fetch(razorpay_payment_id);
      amount = (payment.amount as number) / 100;
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set({ wallet_balance: sql`wallet_balance + ${amount}` })
      .where(eq(usersTable.id, req.user!.id))
      .returning({ wallet_balance: usersTable.wallet_balance });

    await db.insert(transactionsTable).values({
      user_id: req.user!.id,
      amount: String(amount),
      type: "TOPUP",
      status: "SUCCESS",
      razorpay_order_id,
    });

    res.json({ wallet_balance: parseFloat(updatedUser.wallet_balance), message: `₹${amount} added to your wallet` });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
