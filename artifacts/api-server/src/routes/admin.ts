import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, merchantsTable, transactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth.js";
import { desc, sql, eq, ilike, or, gte, and } from "drizzle-orm";

const router = Router();

router.get("/admin/stats", requireAuth(["admin"]), async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [[userCount], [merchantCount], [txStats], [todayStats], [activeKiosks], [failedTx]] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
      db.select({ count: sql<number>`count(*)::int` }).from(merchantsTable),
      db.select({
        total: sql<number>`count(*)::int`,
        volume: sql<number>`COALESCE(SUM(amount), 0)::float`,
      }).from(transactionsTable).where(eq(transactionsTable.status, "SUCCESS")),
      db.select({
        count: sql<number>`count(*)::int`,
        volume: sql<number>`COALESCE(SUM(amount), 0)::float`,
      }).from(transactionsTable).where(and(eq(transactionsTable.status, "SUCCESS"), gte(transactionsTable.timestamp, today))),
      db.select({ count: sql<number>`count(*)::int` }).from(merchantsTable).where(eq(merchantsTable.is_online, true)),
      db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).where(eq(transactionsTable.status, "FAILED")),
    ]);

    res.json({
      total_users: userCount.count,
      total_merchants: merchantCount.count,
      total_volume: txStats.volume,
      total_transactions: txStats.total,
      active_kiosks: activeKiosks.count,
      failed_transactions: failedTx.count,
      today_volume: todayStats.volume,
      today_transactions: todayStats.count,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/admin/users", requireAuth(["admin"]), async (req, res) => {
  const page = parseInt(String(req.query.page ?? 1));
  const limit = parseInt(String(req.query.limit ?? 20));
  const search = String(req.query.search ?? "");
  const offset = (page - 1) * limit;
  try {
    const whereClause = search
      ? or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`))
      : undefined;

    const items = await db.select().from(usersTable).where(whereClause).orderBy(desc(usersTable.created_at)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(usersTable).where(whereClause);

    res.json({
      items: items.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        wallet_balance: parseFloat(u.wallet_balance),
        is_verified: u.is_verified,
        biometric_enrolled: !!u.biometric_template,
        created_at: u.created_at,
      })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get("/admin/merchants", requireAuth(["admin"]), async (req, res) => {
  const page = parseInt(String(req.query.page ?? 1));
  const limit = parseInt(String(req.query.limit ?? 20));
  const search = String(req.query.search ?? "");
  const offset = (page - 1) * limit;
  try {
    const whereClause = search
      ? or(ilike(merchantsTable.shop_name, `%${search}%`), ilike(merchantsTable.email, `%${search}%`))
      : undefined;

    const items = await db.select().from(merchantsTable).where(whereClause).orderBy(desc(merchantsTable.created_at)).limit(limit).offset(offset);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(merchantsTable).where(whereClause);

    res.json({
      items: items.map((m) => ({
        id: m.id,
        shop_name: m.shop_name,
        email: m.email,
        merchant_balance: parseFloat(m.merchant_balance),
        kiosk_id: m.kiosk_id,
        is_online: m.is_online,
        created_at: m.created_at,
      })),
      total: count,
      page,
      limit,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch merchants" });
  }
});

router.get("/admin/transactions", requireAuth(["admin"]), async (req, res) => {
  const page = parseInt(String(req.query.page ?? 1));
  const limit = parseInt(String(req.query.limit ?? 50));
  const type = req.query.type as string | undefined;
  const offset = (page - 1) * limit;
  try {
    const whereClause = type && (type === "TOPUP" || type === "PURCHASE")
      ? eq(transactionsTable.type, type)
      : undefined;

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
      .where(whereClause)
      .orderBy(desc(transactionsTable.timestamp))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(transactionsTable).where(whereClause);

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

router.get("/admin/hardware/status", requireAuth(["admin"]), async (req, res) => {
  try {
    const merchants = await db.select().from(merchantsTable).orderBy(merchantsTable.id);
    res.json(merchants.map((m) => ({
      kiosk_id: m.kiosk_id,
      merchant_id: m.id,
      shop_name: m.shop_name,
      is_online: m.is_online,
      last_seen: m.last_seen ?? null,
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to fetch hardware status" });
  }
});

export default router;
