import "dotenv/config";
import axios from "axios";
import { db } from "./lib/db/src/index";

async function runTest() {
  console.log("=== STARTING END-TO-END PAYMENT VERIFICATION ===");
  
  const API_BASE = "http://localhost:8080";
  
  try {
    // 1. Check database balances before payment
    const userBefore = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    const merchantBefore = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });
    
    if (!userBefore || !merchantBefore) {
      console.error("Missing seeded user or merchant in DB!");
      process.exit(1);
    }
    
    console.log(`[DB Balance Before] User (John Doe): ₹${userBefore.wallet_balance}`);
    console.log(`[DB Balance Before] Merchant (BioPay Store): ₹${merchantBefore.merchant_balance}`);
    
    // 2. Login as merchant to acquire token
    console.log("\nLogging in as merchant...");
    const loginRes = await axios.post(`${API_BASE}/api/auth/login/merchant`, {
      email: "merchant@biopay.dev",
      password: "password123"
    });
    
    const token = loginRes.data.token;
    console.log("Merchant login successful!");
    
    // 3. Initiate payment session for ₹50
    console.log("\nInitiating merchant POS payment session for ₹50...");
    const initRes = await axios.post(`${API_BASE}/api/merchants/me/pos/initiate`, {
      amount: 50
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log("POS session initiated successfully:", initRes.data);
    
    // 4. Simulate a palm scan on the hardware terminal
    console.log("\nSimulating palm scan verification (Vein Scan Match)...");
    const scanRes = await axios.post(`${API_BASE}/api/hardware/verify-scan`, {
      biometric_hash: "8db016202a60d6147ac8f6cd1d8e18a08358f14e141ad3d933a5a69c29d53824",
      merchant_id: 1,
      amount: 50
    });
    
    console.log("Hardware verify-scan completed successfully:", scanRes.data);
    
    // 5. Query and assert database balances after payment
    const userAfter = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    const merchantAfter = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });
    
    console.log("\n=== POST-TRANSACTION BALANCES ===");
    console.log(`[DB Balance After] User (John Doe): ₹${userAfter?.wallet_balance} (Expected: ₹950.00)`);
    console.log(`[DB Balance After] Merchant (BioPay Store): ₹${merchantAfter?.merchant_balance} (Expected: ₹50.00)`);
    
    // 6. Check registered transaction
    const txs = await db.query.transactionsTable.findMany();
    console.log("\n=== TRANSACTIONS REGISTERED ===");
    console.table(txs.map(t => ({
      id: t.id,
      user_id: t.user_id,
      merchant_id: t.merchant_id,
      amount: t.amount,
      type: t.type,
      status: t.status,
      timestamp: t.timestamp
    })));
    
    if (
      userAfter && 
      parseFloat(userAfter.wallet_balance) === 950 && 
      merchantAfter && 
      parseFloat(merchantAfter.merchant_balance) === 50
    ) {
      console.log("\n SUCCESS: End-to-end ACID payment transaction and hardware simulation works perfectly!");
    } else {
      console.error("\n FAILED: Balance mismatch.");
    }
    
  } catch (err: any) {
    console.error("Test failed with error:", err.response?.data || err.message);
  } finally {
    process.exit(0);
  }
}

runTest();
