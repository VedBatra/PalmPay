import "dotenv/config";
import { db, usersTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";

const BLACKLISTED_HASHES = new Set([
  "22d05d61a54173b13d57f9b57dd9723abf760b038925411e6b98a77bd514bec0", // 2592x1944
  "7818f5542a0404157573be6cffc0e0c8e68ce3c0f5d17d07ccdd9313fb700baf", // 640x480
  "11283ef755895422e6f28b93f3d78cad7539891cf2893c9fdccefb923c5bf70b", // 1920x1080
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  // Empty
]);

function hexToBits(hex: string): boolean[] {
  const bits: boolean[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    for (let bit = 7; bit >= 0; bit--) {
      bits.push(((byte >> bit) & 1) === 1);
    }
  }
  return bits;
}

function countActiveBits(hex: string): number {
  const bits = hexToBits(hex);
  return bits.filter(b => b).length;
}

function getInvalidOrLowQualityReason(hashString: string | null): string | null {
  if (!hashString) return null;
  const parts = hashString.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (BLACKLISTED_HASHES.has(trimmed)) {
      return `Blacklisted/empty hash: ${trimmed.substring(0, 16)}...`;
    }
    if (trimmed.length === 256) {
      const activeBits = countActiveBits(trimmed);
      if (activeBits < 50) {
        return `Low-quality template with only ${activeBits} active bits (threshold is 50)`;
      }
    }
  }
  return null;
}

async function main() {
  console.log("=== SCANNING FOR USERS WITH INVALID/BLANK/LOW-QUALITY BIOMETRICS ===");
  try {
    const users = await db.query.usersTable.findMany();
    let resetCount = 0;

    for (const user of users) {
      const reason = getInvalidOrLowQualityReason(user.biometric_template);
      if (user.biometric_template && reason) {
        console.log(`⚠️ User "${user.name}" (${user.email}) has invalid or low-quality biometric hashes!`);
        console.log(`   Reason: ${reason}`);
        console.log(`   Current biometric template: ${user.biometric_template.substring(0, 30)}...`);
        
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

    console.log(`\nScan complete. Reset ${resetCount} users with invalid/low-quality templates.`);
  } catch (err) {
    console.error("Error cleaning blank/low-quality hashes:", err);
  } finally {
    process.exit(0);
  }
}

main();
