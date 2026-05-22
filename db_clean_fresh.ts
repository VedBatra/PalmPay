import "dotenv/config";
import { db, usersTable, merchantsTable, transactionsTable } from "./lib/db/src/index";
import { sql } from "drizzle-orm";

async function main() {
  console.log("=== DB FRESH CLEANUP: DELETING USERS & TRANSACTIONS, RESETTING MERCHANTS ===");
  try {
    // 1. Delete all transactions
    console.log("Deleting all transactions...");
    await db.delete(transactionsTable);
    console.log("All transactions deleted successfully.");

    // 2. Delete all users
    console.log("Deleting all registered users...");
    await db.delete(usersTable);
    console.log("All registered users deleted successfully.");

    // 3. Reset merchant balances but keep them
    console.log("Resetting merchant balances and setting them online...");
    await db.update(merchantsTable)
      .set({
        merchant_balance: "0.00",
        is_online: true,
        last_seen: new Date()
      });
    console.log("All merchant accounts updated successfully (balances reset to ₹0.00).");

    console.log("\n✅ SUCCESS: Database cleanup completed successfully!");
  } catch (err) {
    console.error("Error during database cleanup:", err);
  } finally {
    process.exit(0);
  }
}

main();
