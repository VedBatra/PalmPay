import "dotenv/config";
import { db, usersTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding test user...");
  try {
    const password_hash = await bcrypt.hash("user123", 10);
    
    // Check if user already exists
    const existing = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });

    if (existing) {
      console.log("User already exists:", existing);
      
      // Update biometric hash to the demo lock hash
      await db.update(usersTable)
        .set({ 
          biometric_template: "8db016202a60d6147ac8f6cd1d8e18a08358f14e141ad3d933a5a69c29d53824",
          is_verified: true,
          wallet_balance: "1000.00"
        })
        .where(eq(usersTable.id, existing.id));
      console.log("Updated existing user to have correct biometric template and balance.");
      return;
    }

    // Insert user
    const [user] = await db.insert(usersTable).values({
      name: "John Doe",
      email: "user@biopay.dev",
      password_hash,
      biometric_template: "8db016202a60d6147ac8f6cd1d8e18a08358f14e141ad3d933a5a69c29d53824",
      wallet_balance: "1000.00",
      is_verified: true
    }).returning();
    
    console.log("User seeded successfully:", user);
  } catch (err) {
    console.error("Error seeding user:", err);
  } finally {
    process.exit(0);
  }
}

main();
