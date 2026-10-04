import "dotenv/config";
import { db, usersTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2];
  const hash = process.argv[3];

  if (!email || !hash) {
    console.error("Usage: npx tsx db_register_palm.ts <email> <biometric_hash>");
    process.exit(1);
  }

  try {
    const user = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, email)
    });

    if (!user) {
      console.error(`User with email "${email}" not found.`);
      process.exit(1);
    }

    await db.update(usersTable)
      .set({ biometric_template: hash, is_verified: true })
      .where(eq(usersTable.id, user.id));

    console.log(`Successfully enrolled palm for user: ${user.name} (${email})`);
    console.log(`Template Hash: ${hash}`);
  } catch (err) {
    console.error("Error updating user biometric:", err);
  } finally {
    process.exit(0);
  }
}

main();
