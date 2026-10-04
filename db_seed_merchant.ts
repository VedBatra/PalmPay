import "dotenv/config";
import { db, merchantsTable } from "./lib/db/src/index";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding merchant...");
  try {
    const password_hash = await bcrypt.hash("password123", 10);
    
    // Check if merchant already exists
    const existing = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });

    if (existing) {
      console.log("Merchant already exists:", existing);
      return;
    }

    // Insert merchant with ID 1
    const [merchant] = await db.insert(merchantsTable).values({
      id: 1,
      shop_name: "BioPay Store",
      email: "merchant@biopay.dev",
      password_hash,
      kiosk_id: "KIOSK_1",
      merchant_balance: "0.00"
    }).returning();
    
    console.log("Merchant seeded successfully:", merchant);
  } catch (err) {
    console.error("Error seeding merchant:", err);
  } finally {
    process.exit(0);
  }
}

main();
