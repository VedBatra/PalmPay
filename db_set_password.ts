import "dotenv/config";
import { db, usersTable, merchantsTable, adminsTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: npx tsx db_set_password.ts <email> <new_password>");
    process.exit(1);
  }

  const email = args[0].trim().toLowerCase();
  const newPassword = args[1];

  try {
    const password_hash = await bcrypt.hash(newPassword, 10);

    // 1. Check users
    const user = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, email)
    });
    if (user) {
      await db.update(usersTable)
        .set({ password_hash })
        .where(eq(usersTable.id, user.id));
      console.log(`✅ Success: Reset password for User "${email}" to "${newPassword}".`);
      process.exit(0);
    }

    // 2. Check merchants
    const merchant = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, email)
    });
    if (merchant) {
      await db.update(merchantsTable)
        .set({ password_hash })
        .where(eq(merchantsTable.id, merchant.id));
      console.log(`✅ Success: Reset password for Merchant "${email}" to "${newPassword}".`);
      process.exit(0);
    }

    // 3. Check admins
    const admin = await db.query.adminsTable.findFirst({
      where: (a, { eq }) => eq(a.email, email)
    });
    if (admin) {
      await db.update(adminsTable)
        .set({ password_hash })
        .where(eq(adminsTable.id, admin.id));
      console.log(`✅ Success: Reset password for Admin "${email}" to "${newPassword}".`);
      process.exit(0);
    }

    console.error(`❌ Error: No user, merchant, or admin found with email "${email}".`);
    process.exit(1);
  } catch (err) {
    console.error("Error setting password:", err);
    process.exit(1);
  }
}

main();
