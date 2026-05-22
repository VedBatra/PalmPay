import "dotenv/config";
import axios from "axios";
import { db } from "../lib/db/src/index";

async function run() {
  const API_BASE = "http://localhost:8080";
  const TEST_AMOUNT = 125;

  console.log("=== INITIATING HARDWARE-IN-THE-LOOP CHECKOUT ===");

  try {
    // 1. Get initial balances
    const userBefore = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    const merchantBefore = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });

    if (!userBefore || !merchantBefore) {
      console.error("User or merchant not found in DB!");
      return;
    }

    console.log(`[Before Checkout] User Balance: ₹${userBefore.wallet_balance}`);
    console.log(`[Before Checkout] Merchant Balance: ₹${merchantBefore.merchant_balance}`);

    // 2. Login as merchant
    console.log("\nLogging in as merchant...");
    const loginRes = await axios.post(`${API_BASE}/api/auth/login/merchant`, {
      email: "merchant@biopay.dev",
      password: "password123"
    });
    const token = loginRes.data.token;
    console.log("Merchant login successful!");

    // 3. Initiate payment session for ₹125
    console.log(`\nInitiating POS payment session for ₹${TEST_AMOUNT}.00...`);
    const initRes = await axios.post(`${API_BASE}/api/merchants/me/pos/initiate`, {
      amount: TEST_AMOUNT
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log("POS session initiated:", initRes.data);

    console.log("\n>>> WAITING 12 SECONDS FOR THE RASPBERRY PI DAEMON TO COUNT DOWN & AUTO-CAPTURE PALM <<<");
    for (let i = 12; i > 0; i--) {
      process.stdout.write(`${i}... `);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("\nTime's up! Let's check the database balances now...\n");

    // 4. Get final balances
    const userAfter = await db.query.usersTable.findFirst({
      where: (u, { eq }) => eq(u.email, "user@biopay.dev")
    });
    const merchantAfter = await db.query.merchantsTable.findFirst({
      where: (m, { eq }) => eq(m.email, "merchant@biopay.dev")
    });
    
    const txs = await db.query.transactionsTable.findMany({
      orderBy: (t, { desc }) => [desc(t.timestamp)],
      limit: 3
    });

    console.log("=== POST-CHECKOUT STATE ===");
    console.log(`[After Checkout] User Balance: ₹${userAfter?.wallet_balance} (Expected: ₹${(parseFloat(userBefore.wallet_balance) - TEST_AMOUNT).toFixed(2)})`);
    console.log(`[After Checkout] Merchant Balance: ₹${merchantAfter?.merchant_balance} (Expected: ₹${(parseFloat(merchantBefore.merchant_balance) + TEST_AMOUNT).toFixed(2)})`);

    console.log("\n=== RECENT TRANSACTIONS ===");
    console.table(txs.map(t => ({
      id: t.id,
      amount: t.amount,
      status: t.status,
      timestamp: t.timestamp
    })));

    const expectedUserBalance = parseFloat(userBefore.wallet_balance) - TEST_AMOUNT;
    const expectedMerchantBalance = parseFloat(merchantBefore.merchant_balance) + TEST_AMOUNT;

    if (
      userAfter && parseFloat(userAfter.wallet_balance) === expectedUserBalance &&
      merchantAfter && parseFloat(merchantAfter.merchant_balance) === expectedMerchantBalance
    ) {
      console.log("\n🎉 SUCCESS: Automated checkout succeeded flawlessly with dynamic amount!");
    } else {
      console.error("\n❌ FAILED: Balance mismatch. Please check Pi logs / verify-scan status.");
    }

  } catch (err: any) {
    console.error("Checkout test failed:", err.response?.data || err.message);
  }
}

run();
