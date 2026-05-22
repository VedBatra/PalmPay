import "dotenv/config";
import { db, usersTable, merchantsTable, transactionsTable } from "./lib/db/src/index";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== RESETTING DATABASE TO FRESH UN-ENROLLED STATE ===");
  try {
    // 1. Delete all transactions
    console.log("Clearing transactions...");
    await db.delete(transactionsTable);

    // 2. Reset all users' state to un-enrolled and set balance to ₹1000.00
    console.log("Resetting all users to un-enrolled status and ₹1000.00 balance...");
    await db.update(usersTable)
      .set({
        biometric_template: null,
        is_verified: false,
        wallet_balance: "1000.00"
      });
    console.log("All users reset successfully.");

    // 3. Reset all merchant balances to ₹0.00 and set online
    console.log("Resetting all merchant balances to ₹0.00...");
    await db.update(merchantsTable)
      .set({
        merchant_balance: "0.00",
        is_online: true
      });
    console.log("All merchants reset successfully.");

    console.log("\n✅ SUCCESS: Database has been reset! Ready for dynamic real biometric enrollment and test payment.");
  } catch (err) {
    console.error("Error resetting database:", err);
  } finally {
    process.exit(0);
  }
}

main();
