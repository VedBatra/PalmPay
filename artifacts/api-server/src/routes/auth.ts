import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, merchantsTable, adminsTable } from "@workspace/db";
import { signJwt } from "../lib/jwt.js";
import { requireAuth } from "../middlewares/auth.js";
import crypto from "crypto";

const router = Router();

router.post("/auth/register/user", async (req, res) => {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (!name || !email || !password || password.length < 8) {
    res.status(400).json({ error: "Name, email, and password (min 8 chars) required" });
    return;
  }
  try {
    const existing = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.email, email) });
    if (existing) { res.status(400).json({ error: "Email already registered" }); return; }
    const password_hash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({ name, email, password_hash }).returning();
    const token = signJwt({ id: user.id, role: "user", email: user.email, name: user.name });
    res.status(201).json({ token, role: "user", id: user.id, name: user.name, email: user.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/register/merchant", async (req, res) => {
  const { shop_name, email, password } = req.body as { shop_name: string; email: string; password: string };
  if (!shop_name || !email || !password || password.length < 8) {
    res.status(400).json({ error: "Shop name, email, and password (min 8 chars) required" });
    return;
  }
  try {
    const existing = await db.query.merchantsTable.findFirst({ where: (m, { eq }) => eq(m.email, email) });
    if (existing) { res.status(400).json({ error: "Email already registered" }); return; }
    const password_hash = await bcrypt.hash(password, 10);
    const kiosk_id = `KIOSK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const [merchant] = await db.insert(merchantsTable).values({ shop_name, email, password_hash, kiosk_id }).returning();
    const token = signJwt({ id: merchant.id, role: "merchant", email: merchant.email, name: merchant.shop_name });
    res.status(201).json({ token, role: "merchant", id: merchant.id, name: merchant.shop_name, email: merchant.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login/user", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const user = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.email, email) });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    const token = signJwt({ id: user.id, role: "user", email: user.email, name: user.name });
    res.json({ token, role: "user", id: user.id, name: user.name, email: user.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/login/merchant", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const merchant = await db.query.merchantsTable.findFirst({ where: (m, { eq }) => eq(m.email, email) });
    if (!merchant || !(await bcrypt.compare(password, merchant.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    const token = signJwt({ id: merchant.id, role: "merchant", email: merchant.email, name: merchant.shop_name });
    res.json({ token, role: "merchant", id: merchant.id, name: merchant.shop_name, email: merchant.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/login/admin", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  try {
    const admin = await db.query.adminsTable.findFirst({ where: (a, { eq }) => eq(a.email, email) });
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      res.status(401).json({ error: "Invalid credentials" }); return;
    }
    const token = signJwt({ id: admin.id, role: "admin", email: admin.email, name: "Administrator" });
    res.json({ token, role: "admin", id: admin.id, name: "Administrator", email: admin.email });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", requireAuth(), (req, res) => {
  res.json({ id: req.user!.id, role: req.user!.role, email: req.user!.email, name: req.user!.name ?? null });
});

export default router;
