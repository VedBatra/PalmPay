import axios from "axios";
import { db } from "./lib/db/src/index";
import { usersTable, merchantsTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

// Helper to generate a 256-character hex string representing a valid 32x32 biometric template
// with approximately 15% active bits (153 bits set to 1)
function generateBiometricTemplate(): string {
  const flat = new Array(1024).fill(0);
  // Randomly set exactly 153 bits to 1
  const activeIndices = new Set<number>();
  while (activeIndices.size < 153) {
    activeIndices.add(Math.floor(Math.random() * 1024));
  }
  for (const idx of activeIndices) {
    flat[idx] = 1;
  }

  const bytes = new Uint8Array(128);
  for (let i = 0; i < 1024; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = 7 - (i % 8);
    if (flat[i]) {
      bytes[byteIdx] |= (1 << bitIdx);
    }
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Helper to clone a template and flip a specific number of bits to control Jaccard similarity
function generateSimilarTemplate(baseHex: string, bitsToFlip: number): string {
  const bits: boolean[] = [];
  for (let i = 0; i < baseHex.length; i += 2) {
    const byte = parseInt(baseHex.substring(i, i + 2), 16);
    for (let bit = 7; bit >= 0; bit--) {
      bits.push(((byte >> bit) & 1) === 1);
    }
  }

  // Find some active bits (1s) and inactive bits (0s)
  const activeIndices: number[] = [];
  const inactiveIndices: number[] = [];
  bits.forEach((val, idx) => {
    if (val) activeIndices.push(idx);
    else inactiveIndices.push(idx);
  });

  // Flip some active to inactive, and inactive to active to keep density constant
  const count = Math.min(bitsToFlip, activeIndices.length, inactiveIndices.length);
  for (let i = 0; i < count; i++) {
    const actIdx = activeIndices[i];
    const inactIdx = inactiveIndices[i];
    bits[actIdx] = false;
    bits[inactIdx] = true;
  }

  const bytes = new Uint8Array(128);
  for (let i = 0; i < 1024; i++) {
    const byteIdx = Math.floor(i / 8);
    const bitIdx = 7 - (i % 8);
    if (bits[i]) {
      bytes[byteIdx] |= (1 << bitIdx);
    }
  }

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function runCollisionTest() {
  console.log("=== STARTING E2E BIOMETRIC COLLISION PROTECTION & MULTI-USER DETECTION TEST ===");
  const API_BASE = "http://localhost:8080";

  try {
    // 0. Reset users in DB to clean un-enrolled states and set a known password hash
    console.log("Resetting database users and setting password hashes...");
    const passwordHash = await bcrypt.hash("user123", 10);
    await db.update(usersTable)
      .set({ 
        biometric_template: null, 
        is_verified: false,
        password_hash: passwordHash,
        wallet_balance: "1000.00"
      });

    // We have Pratap (id=9 or similar), harrsh (id=8 or similar), and Ved (id=6 or similar) in seed data.
    // Let's fetch Pratap and harrsh from the DB to enroll them.
    const userPratap = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.email, "pratap@bio.dev") });
    const userHarrsh = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.email, "harrsh@bio.dev") });

    if (!userPratap || !userHarrsh) {
      throw new Error("Could not find seeded users Pratap and harrsh in the database!");
    }

    console.log(`Found Seed Users:`);
    console.log(`  - Pratap: ID = ${userPratap.id}, Email = ${userPratap.email}`);
    console.log(`  - Harrsh: ID = ${userHarrsh.id}, Email = ${userHarrsh.email}`);

    // Generate biometric templates for the test
    const pratapTemplate1 = generateBiometricTemplate();
    const pratapTemplate2 = generateBiometricTemplate();
    const pratapTemplate3 = generateBiometricTemplate();
    const pratapMultiTemplate = `${pratapTemplate1},${pratapTemplate2},${pratapTemplate3}`;

    // A. Enroll Pratap successfully
    console.log(`\n[STEP 1] Logging in as Pratap...`);
    const pratapLoginRes = await axios.post(`${API_BASE}/api/auth/login/user`, {
      email: "pratap@bio.dev",
      password: "user123" // from seed
    });
    const pratapToken = pratapLoginRes.data.token;

    console.log(`Enrolling Pratap's palm template...`);
    const pratapEnrollRes = await axios.post(`${API_BASE}/api/users/me/biometric`, {
      biometric_hash: pratapMultiTemplate
    }, {
      headers: { Authorization: `Bearer ${pratapToken}` }
    });
    console.log(`Pratap enrollment response:`, pratapEnrollRes.data);

    // Verify Pratap DB status
    const dbPratap = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userPratap.id) });
    console.log(`Pratap DB Enrolled: ${!!dbPratap?.biometric_template}, Verified: ${dbPratap?.is_verified}`);

    // B. Attempt to enroll Harrsh with a COLLIDING template (using Pratap's Template 2)
    console.log(`\n[STEP 2] Logging in as Harrsh...`);
    const harrshLoginRes = await axios.post(`${API_BASE}/api/auth/login/user`, {
      email: "harrsh@bio.dev",
      password: "user123"
    });
    const harrshToken = harrshLoginRes.data.token;

    console.log(`Attempting to enroll Harrsh with Pratap's exact palm template...`);
    try {
      await axios.post(`${API_BASE}/api/users/me/biometric`, {
        biometric_hash: pratapTemplate2
      }, {
        headers: { Authorization: `Bearer ${harrshToken}` }
      });
      throw new Error("COLLISION BYPASS DETECTED! Exact duplicate enrollment succeeded!");
    } catch (err: any) {
      console.log(`✅ Success: Harrsh duplicate enrollment was REJECTED as expected:`, err.response?.data || err.message);
      if (!err.response?.data?.error?.includes("collision")) {
        throw new Error(`Expected collision error message, got: ${JSON.stringify(err.response?.data)}`);
      }
    }

    // C. Attempt to enroll Harrsh with a HIGHLY SIMILAR colliding template (cloned from Pratap's Template 2 with 5 bits flipped)
    const similarCollidingTemplate = generateSimilarTemplate(pratapTemplate2, 5);
    console.log(`\n[STEP 3] Attempting to enroll Harrsh with a highly similar colliding template (Jaccard > 0.35)...`);
    try {
      await axios.post(`${API_BASE}/api/users/me/biometric`, {
        biometric_hash: similarCollidingTemplate
      }, {
        headers: { Authorization: `Bearer ${harrshToken}` }
      });
      throw new Error("COLLISION BYPASS DETECTED! High-similarity duplicate enrollment succeeded!");
    } catch (err: any) {
      console.log(`✅ Success: Harrsh high-similarity enrollment was REJECTED as expected:`, err.response?.data || err.message);
      if (!err.response?.data?.error?.includes("collision")) {
        throw new Error(`Expected collision error message, got: ${JSON.stringify(err.response?.data)}`);
      }
    }

    // D. Enroll Harrsh successfully with a COMPLETELY UNIQUE template
    const harrshTemplate1 = generateBiometricTemplate();
    const harrshTemplate2 = generateBiometricTemplate();
    const harrshTemplate3 = generateBiometricTemplate();
    const harrshMultiTemplate = `${harrshTemplate1},${harrshTemplate2},${harrshTemplate3}`;

    console.log(`\n[STEP 4] Enrolling Harrsh with a completely unique palm template...`);
    const harrshEnrollRes = await axios.post(`${API_BASE}/api/users/me/biometric`, {
      biometric_hash: harrshMultiTemplate
    }, {
      headers: { Authorization: `Bearer ${harrshToken}` }
    });
    console.log(`Harrsh enrollment response:`, harrshEnrollRes.data);

    // Verify Harrsh DB status
    const dbHarrsh = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userHarrsh.id) });
    console.log(`Harrsh DB Enrolled: ${!!dbHarrsh?.biometric_template}, Verified: ${dbHarrsh?.is_verified}`);

    // E. Verify transaction debit works properly for both users without collision
    // 1. Initiate merchant purchase of ₹200
    console.log(`\n[STEP 5] Merchant initiating a POS transaction of ₹200...`);
    const merchantLoginRes = await axios.post(`${API_BASE}/api/auth/login/merchant`, {
      email: "merchant@biopay.dev",
      password: "password123"
    });
    const merchantToken = merchantLoginRes.data.token;

    const paySessionRes = await axios.post(`${API_BASE}/api/merchants/me/pos/initiate`, {
      amount: 200
    }, {
      headers: { Authorization: `Bearer ${merchantToken}` }
    });
    console.log("POS session initiated:", paySessionRes.data);

    // 2. Scan Pratap's template. Pratap should be charged, Harrsh should NOT be affected.
    console.log(`\nScanning Pratap's correct template (Template 1)...`);
    const verifyPratapRes = await axios.post(`${API_BASE}/api/hardware/verify-scan`, {
      biometric_hash: pratapTemplate1,
      merchant_id: 1,
      amount: 200
    });
    console.log("Pratap transaction response:", verifyPratapRes.data);

    // Verify balances
    const checkPratap = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userPratap.id) });
    const checkHarrsh = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userHarrsh.id) });
    console.log(`Pratap Balance: ₹${checkPratap?.wallet_balance} (Expected: ₹800.00)`);
    console.log(`Harrsh Balance: ₹${checkHarrsh?.wallet_balance} (Expected: ₹1000.00)`);

    if (parseFloat(checkPratap?.wallet_balance || "0") !== 800.00 || parseFloat(checkHarrsh?.wallet_balance || "0") !== 1000.00) {
      throw new Error(`Balance mismatch after Pratap transaction!`);
    }

    // 3. Initiate another merchant purchase of ₹300
    console.log(`\n[STEP 6] Merchant initiating another POS transaction of ₹300...`);
    const paySession2Res = await axios.post(`${API_BASE}/api/merchants/me/pos/initiate`, {
      amount: 300
    }, {
      headers: { Authorization: `Bearer ${merchantToken}` }
    });
    console.log("POS session initiated:", paySession2Res.data);

    // 4. Scan Harrsh's template. Harrsh should be charged, Pratap should NOT be affected.
    console.log(`\nScanning Harrsh's correct template (Template 2)...`);
    const verifyHarrshRes = await axios.post(`${API_BASE}/api/hardware/verify-scan`, {
      biometric_hash: harrshTemplate2,
      merchant_id: 1,
      amount: 300
    });
    console.log("Harrsh transaction response:", verifyHarrshRes.data);

    // Verify balances
    const checkPratap2 = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userPratap.id) });
    const checkHarrsh2 = await db.query.usersTable.findFirst({ where: (u, { eq }) => eq(u.id, userHarrsh.id) });
    console.log(`Pratap Balance: ₹${checkPratap2?.wallet_balance} (Expected: ₹800.00)`);
    console.log(`Harrsh Balance: ₹${checkHarrsh2?.wallet_balance} (Expected: ₹700.00)`);

    if (parseFloat(checkPratap2?.wallet_balance || "0") !== 800.00 || parseFloat(checkHarrsh2?.wallet_balance || "0") !== 700.00) {
      throw new Error(`Balance mismatch after Harrsh transaction!`);
    }

    console.log(`\n✅ ALL TESTS PASSED! BIOMETRIC COLLISION DETECTED AND MULTI-USER DEBIT WORKED 100% PERFECTLY WITH NO CORROSION!`);

  } catch (err: any) {
    console.error(`\n❌ TEST FAILED:`, err.message || err.response?.data || err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runCollisionTest();
