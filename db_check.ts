import { db } from "./lib/db/src/index";
import path from "path";

async function main() {
  console.log("Database URL:", process.env.DATABASE_URL);
  
  try {
    const users = await db.query.usersTable.findMany();
    console.log("\n--- Users ---");
    console.table(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      balance: u.wallet_balance,
      biometric: u.biometric_template ? `${u.biometric_template.substring(0, 10)}...` : "None",
      verified: u.is_verified
    })));

    const merchants = await db.query.merchantsTable.findMany();
    console.log("\n--- Merchants ---");
    console.table(merchants.map(m => ({
      id: m.id,
      name: m.name,
      shop: m.shop_name,
      kiosk: m.kiosk_id,
      online: m.is_online,
      balance: m.merchant_balance
    })));

    const txs = await db.query.transactionsTable.findMany();
    console.log("\n--- Transactions ---");
    console.table(txs);
  } catch (err) {
    console.error("Error querying DB:", err);
  } finally {
    process.exit(0);
  }
}

main();
