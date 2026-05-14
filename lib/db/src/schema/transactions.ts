import { pgTable, serial, integer, decimal, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id"),
  merchant_id: integer("merchant_id"),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  type: text("type", { enum: ["TOPUP", "PURCHASE"] }).notNull(),
  status: text("status", { enum: ["SUCCESS", "FAILED"] }).notNull(),
  razorpay_order_id: text("razorpay_order_id"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, timestamp: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
