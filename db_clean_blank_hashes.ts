import "dotenv/config";
import { db, usersTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";

const BLACKLISTED_HASHES = new Set([
  "22d05d61a54173b13d57f9b57dd9723abf760b038925411e6b98a77bd514bec0", // 2592x1944
  "7818f5542a0404157573be6cffc0e0c8e68ce3c0f5d17d07ccdd9313fb700baf", // 640x480
  "11283ef755895422e6f28b93f3d78cad7539891cf2893c9fdccefb923c5bf70b", // 1920x1080
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  // Empty
]);

function hasBlacklistedHash(hashString: string | null): boolean {
  if (!hashString) return false;
  const parts = hashString.split(",");
  for (const part of parts) {
    if (BLACKLISTED_HASHES.has(part.trim())) {
      return true;
    }
  }
  return false;
}

async function main() {
  console.log("=== SCANNING FOR USERS WITH INVALID/BLANK BIOMETRICS ===");
  try {
    const users = await db.query.usersTable.findMany();
    let resetCount = 0;

    for (const user of users) {
      if (user.biometric_template && hasBlacklistedHash(user.biometric_template)) {
        console.log(`⚠️ User "${user.name}" (${user.email}) has blacklisted/blank biometric hashes!`);
        console.log(`   Current biometric template: ${user.biometric_template}`);
        
        await db.update(usersTable)
          .set({
            biometric_template: null,
            is_verified: false
          })
          .where(eq(usersTable.id, user.id));
          
        console.log(`   ✅ Biometric reset successfully.`);
        resetCount++;
      }
    }

    console.log(`\nScan complete. Reset ${resetCount} users with blank/invalid templates.`);
  } catch (err) {
    console.error("Error cleaning blank hashes:", err);
  } finally {
    process.exit(0);
  }
}

main();
