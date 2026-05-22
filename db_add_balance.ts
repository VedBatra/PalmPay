import "dotenv/config";
import { db, usersTable } from "./lib/db/src/index";
import { eq, sql } from "drizzle-orm";

async function main() {
  console.log("Adding ₹1000.00 to Harshad's account balance...");
  try {
    const harshad = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "harshad@bio.dev")
    });

    if (!harshad) {
      console.error("Error: Harshad's account (harshad@bio.dev) not found in database.");
      process.exit(1);
    }

    await db.update(usersTable)
      .set({
        wallet_balance: sql`wallet_balance + 1000.00`
      })
      .where(eq(usersTable.id, harshad.id));

    const updated = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.id, harshad.id)
    });

    console.log("Updated Harshad's account successfully:", {
      id: updated?.id,
      name: updated?.name,
      email: updated?.email,
      wallet_balance: updated?.wallet_balance
    });
  } catch (err) {
    console.error("Error updating balance:", err);
  } finally {
    process.exit(0);
  }
}

main();
