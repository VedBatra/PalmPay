import { Router } from "express";
import { db } from "@workspace/db";
import { merchantsTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { emitToMerchant } from "../lib/socket.js";
import crypto from "crypto";

const router = Router();

router.get("/merchants/me", requireAuth(["merchant"]), async (req, res) => {
  try {
    const merchant = await db.query.merchantsTable.findFirst({ where: (m, { eq }) => eq(m.id, req.user!.id) });
    if (!merchant) { res.status(404).json({ error: "Merchant not found" }); return; }
    res.json({
      id: merchant.id,
      shop_name: merchant.shop_name,
      email: merchant.email,
      merchant_balance: parseFloat(merchant.merchant_balance),
      kiosk_id: merchant.kiosk_id,
      is_online: merchant.is_online,
      created_at: merchant.created_at,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch merchant profile" });
  }
});

router.get("/merchants/me/transactions", requireAuth(["merchant"]), async (req, res) => {
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
        user_name: sql<string>`(SELECT name FROM users WHERE id = ${transactionsTable.user_id})`.as("user_name"),
        merchant_name: sql<string>`(SELECT shop_name FROM merchants WHERE id = ${transactionsTable.merchant_id})`.as("merchant_name"),
      })
      .from(transactionsTable)
      .where(eq(transactionsTable.merchant_id, req.user!.id))
      .orderBy(desc(transactionsTable.timestamp))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(eq(transactionsTable.merchant_id, req.user!.id));

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

router.get("/merchants/me/earnings/summary", requireAuth(["merchant"]), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const baseWhere = and(eq(transactionsTable.merchant_id, req.user!.id), eq(transactionsTable.status, "SUCCESS"), eq(transactionsTable.type, "PURCHASE"));

    const [todayRow] = await db
      .select({ earnings: sql<number>`COALESCE(SUM(amount), 0)::float`, count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(and(baseWhere, gte(transactionsTable.timestamp, today)));

    const [weeklyRow] = await db
      .select({ earnings: sql<number>`COALESCE(SUM(amount), 0)::float` })
      .from(transactionsTable)
      .where(and(baseWhere, gte(transactionsTable.timestamp, weekAgo)));

    const [totalRow] = await db
      .select({ earnings: sql<number>`COALESCE(SUM(amount), 0)::float`, count: sql<number>`count(*)::int` })
      .from(transactionsTable)
      .where(baseWhere);

    res.json({
      today_earnings: todayRow.earnings ?? 0,
      today_count: todayRow.count ?? 0,
      total_earnings: totalRow.earnings ?? 0,
      total_count: totalRow.count ?? 0,
      weekly_earnings: weeklyRow.earnings ?? 0,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch earnings summary" });
  }
});

const activeSessions = new Map<number, { session_id: string; amount: number; status: string }>();

router.post("/merchants/me/pos/initiate", requireAuth(["merchant"]), async (req, res) => {
  const { amount } = req.body as { amount: number };
  if (!amount || amount < 1) { res.status(400).json({ error: "Amount must be at least ₹1" }); return; }
  try {
    const session_id = crypto.randomBytes(8).toString("hex");
    activeSessions.set(req.user!.id, { session_id, amount, status: "WAITING" });
    emitToMerchant(req.user!.id, "payment:waiting", { session_id, amount });
    res.json({ session_id, amount, status: "WAITING", message: "Awaiting palm scan..." });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

router.post("/merchants/me/pos/cancel", requireAuth(["merchant"]), async (req, res) => {
  activeSessions.delete(req.user!.id);
  emitToMerchant(req.user!.id, "payment:cancelled", {});
  res.json({ message: "Payment session cancelled" });
});

export { activeSessions };
export default router;
