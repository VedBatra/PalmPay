import { pgTable, serial, text, decimal, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const merchantsTable = pgTable("merchants", {
  id: serial("id").primaryKey(),
  shop_name: text("shop_name").notNull(),
  email: text("email").notNull().unique(),
  password_hash: text("password_hash").notNull(),
  merchant_balance: decimal("merchant_balance", { precision: 12, scale: 2 }).notNull().default("0.00"),
  kiosk_id: text("kiosk_id").notNull().unique(),
  is_online: boolean("is_online").notNull().default(false),
  last_seen: timestamp("last_seen"),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export const insertMerchantSchema = createInsertSchema(merchantsTable).omit({ id: true, created_at: true });
export type InsertMerchant = z.infer<typeof insertMerchantSchema>;
export type Merchant = typeof merchantsTable.$inferSelect;
