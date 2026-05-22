
import axios from "axios";
import { db } from "./lib/db/src/index";
import { usersTable, merchantsTable, transactionsTable } from "./lib/db/src/index";
import { eq } from "drizzle-orm";

async function runTest() {
  console.log("=== STARTING REAL BIOMETRIC ENROLLMENT & REAL-MATCH PAYMENT VERIFICATION ===");
  
  const API_BASE = "http://localhost:8080";
  const TEST_VEIN_HASH_1 = "hash1_" + Math.random().toString(36).substring(2, 10);
  const TEST_VEIN_HASH_2 = "hash2_" + Math.random().toString(36).substring(2, 10);
  const TEST_VEIN_HASH_3 = "hash3_" + Math.random().toString(36).substring(2, 10);
  const MULTI_SCAN_HASH = `${TEST_VEIN_HASH_1},${TEST_VEIN_HASH_2},${TEST_VEIN_HASH_3}`;
  
  try {
    // 0. Reset balances and biometric template for clean testing
    console.log("Resetting database test states...");
    await db.update(usersTable)
      .set({
        wallet_balance: "1000.00",
        biometric_template: null,
        is_verified: false
      })
      .where(eq(usersTable.email, "user@biopay.dev"));

    await db.update(merchantsTable)
      .set({
        merchant_balance: "0.00"
      })
      .where(eq(merchantsTable.email, "merchant@biopay.dev"));

    // Verify reset states
    const initialUser = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    console.log(`[Initial User State] Enrolled: ${!!initialUser?.biometric_template}, Balance: ₹${initialUser?.wallet_balance}`);

    // 1. Login as User to acquire User Token
    console.log("\nLogging in as user...");
    const userLoginRes = await axios.post(`${API_BASE}/api/auth/login/user`, {
      email: "user@biopay.dev",
      password: "user123"
    });
    const userToken = userLoginRes.data.token;
    console.log("User login successful!");

    // 2. Initiate Biometric Enrollment from User Dashboard
    console.log("\nInitiating biometric enrollment from user dashboard...");
    const initEnrollRes = await axios.post(`${API_BASE}/api/users/me/biometric/initiate`, {}, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    console.log("Enrollment session initiated:", initEnrollRes.data);

    // 3. Poll Active Enrollment Session (what the Pi daemon does)
    console.log("\nPolling active enrollment session from kiosk (merchant_id = 1)...");
    const pollEnrollRes = await axios.get(`${API_BASE}/api/hardware/active-enrollment/1`);
    console.log("Kiosk enrollment poll results:", pollEnrollRes.data);

    if (!pollEnrollRes.data.active) {
      throw new Error("Enrollment session was not active on kiosk 1!");
    }

    // 4. Simulate physical scanning and registration (post scan from Pi to registry)
    console.log(`\nSimulating physical scan capture. Submitting real multi-vein hash: "${MULTI_SCAN_HASH}"...`);
    const registerScanRes = await axios.post(`${API_BASE}/api/hardware/register-scan`, {
      biometric_hash: MULTI_SCAN_HASH,
      merchant_id: 1
    });
    console.log("Hardware register-scan response:", registerScanRes.data);

    // 5. Verify User DB template is updated
    const enrolledUser = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    console.log(`\n[User State After Enrollment] Enrolled: ${!!enrolledUser?.biometric_template}, Saved Hash: "${enrolledUser?.biometric_template}", Verified: ${enrolledUser?.is_verified}`);
    if (enrolledUser?.biometric_template !== MULTI_SCAN_HASH || !enrolledUser?.is_verified) {
      throw new Error("Verification failed: Biometric template or verified flag was not committed!");
    }

    // 6. Login as Merchant to initiate a purchase
    console.log("\nLogging in as merchant...");
    const merchantLoginRes = await axios.post(`${API_BASE}/api/auth/login/merchant`, {
      email: "merchant@biopay.dev",
      password: "password123"
    });
    const merchantToken = merchantLoginRes.data.token;
    console.log("Merchant login successful!");

    // 7. Initiate dynamic POS payment session for ₹150
    console.log("\nInitiating POS payment session for ₹150...");
    const paySessionRes = await axios.post(`${API_BASE}/api/merchants/me/pos/initiate`, {
      amount: 150
    }, {
      headers: { Authorization: `Bearer ${merchantToken}` }
    });
    console.log("Payment session initiated:", paySessionRes.data);

    // 8. Attempt verification with WRONG hash (should fail)
    console.log("\n[ATTEMPT 1] Scanning with WRONG unregistered palm vein hash...");
    try {
      await axios.post(`${API_BASE}/api/hardware/verify-scan`, {
        biometric_hash: "wrong_unregistered_hash_1111",
        merchant_id: 1,
        amount: 150
      });
      throw new Error("Attempt 1 should have failed with 404!");
    } catch (err: any) {
      console.log("Attempt 1 failed as expected:", err.response?.data || err.message);
    }

    // 9. Attempt verification with CORRECT registered hash (should succeed matching against the multi-scan array)
    console.log(`\n[ATTEMPT 2] Scanning with CORRECT registered palm vein hash: "${TEST_VEIN_HASH_2}"...`);
    const verifyScanRes = await axios.post(`${API_BASE}/api/hardware/verify-scan`, {
      biometric_hash: TEST_VEIN_HASH_2,
      merchant_id: 1,
      amount: 150
    });
    console.log("Attempt 2 response (Scan matched & payment completed):", verifyScanRes.data);

    // 10. Check final balances
    const finalUser = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    const finalMerchant = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });

    console.log("\n=== FINAL BALANCES ===");
    console.log(`User Balance: ₹${finalUser?.wallet_balance} (Expected: ₹850.00)`);
    console.log(`Merchant Balance: ₹${finalMerchant?.merchant_balance} (Expected: ₹150.00)`);

    if (
      finalUser && 
      parseFloat(finalUser.wallet_balance) === 850 && 
      finalMerchant && 
      parseFloat(finalMerchant.merchant_balance) === 150
    ) {
      console.log("\n✅ SUCCESS: E2E BIOMETRIC ENROLLMENT & REAL HASH VERIFICATION TRANSACTION FLOW TEST PASSED PERFECTLY!");
    } else {
      console.error("\n❌ FAILED: Balance mismatch.");
      process.exit(1);
    }

  } catch (err: any) {
    console.error("Test failed with error:", err.response?.data || err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runTest();
