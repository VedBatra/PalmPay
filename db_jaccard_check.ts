import { db } from "./lib/db/src/index";

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

function computeJaccardSimilarity(hex1: string, hex2: string): number {
  const bits1 = hexToBits(hex1);
  const bits2 = hexToBits(hex2);
  let match = 0;
  let union = 0;
  const length = Math.min(bits1.length, bits2.length);
  for (let i = 0; i < length; i++) {
    if (bits1[i] || bits2[i]) {
      union++;
      if (bits1[i] && bits2[i]) {
        match++;
      }
    }
  }
  if (union === 0) return 0;
  return match / union;
}

async function main() {
  const users = await db.query.usersTable.findMany({
    where: (u, { and, eq, isNotNull }) => and(
      eq(u.is_verified, true),
      isNotNull(u.biometric_template)
    )
  });

  console.log(`Found ${users.length} verified users with templates.`);

  for (let i = 0; i < users.length; i++) {
    const u1 = users[i];
    const templates1 = u1.biometric_template!.split(",");
    
    for (let j = i; j < users.length; j++) {
      const u2 = users[j];
      const templates2 = u2.biometric_template!.split(",");
      
      console.log(`\nComparing ${u1.name} (User ${u1.id}) with ${u2.name} (User ${u2.id}):`);
      console.log(`  ${u1.name} templates:`, templates1);
      console.log(`  ${u2.name} templates:`, templates2);
      
      for (let t1Idx = 0; t1Idx < templates1.length; t1Idx++) {
        for (let t2Idx = 0; t2Idx < templates2.length; t2Idx++) {
          if (u1.id === u2.id && t1Idx >= t2Idx) continue; // Skip identical or duplicate template comparisons for same user
          
          const score = computeJaccardSimilarity(templates1[t1Idx], templates2[t2Idx]);
          console.log(`  - ${u1.name}[${t1Idx}] vs ${u2.name}[${t2Idx}]: Jaccard Score = ${score.toFixed(4)}`);
        }
      }
    }
  }
  process.exit(0);
}

main();
