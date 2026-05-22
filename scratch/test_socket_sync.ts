import { io } from "socket.io-client";

async function runTest() {
  console.log("=== STARTING SOCKET SYNC REAL-TIME VERIFICATION ===");
  
  const API_BASE = "http://localhost:8080";
  let receivedWaiting = false;
  let receivedSuccess = false;

  try {
    // 1. Login as merchant to acquire token
    console.log("Logging in as merchant...");
    const loginRes = await fetch(`${API_BASE}/api/auth/login/merchant`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "merchant@biopay.dev",
        password: "password123"
      })
    });
    
    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
    }
    
    const loginData = await loginRes.json() as { token: string };
    const token = loginData.token;
    console.log("Merchant login successful! Token acquired.");

    // 2. Connect to Socket.IO using auth token (simulating frontend)
    console.log("Connecting to Socket.IO server at http://localhost:8080...");
    const socket = io("http://localhost:8080", {
      path: "/api/socket.io",
      auth: { token },
      transports: ["websocket"]
    });

    socket.on("connect", () => {
      console.log("Socket connected successfully with ID:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    socket.on("payment:waiting", (data) => {
      console.log("\n[SOCKET EVENT] payment:waiting received!", data);
      receivedWaiting = true;
    });

    socket.on("payment:success", (data) => {
      console.log("\n[SOCKET EVENT] payment:success received!", data);
      receivedSuccess = true;
    });

    socket.on("payment:failed", (data) => {
      console.log("\n[SOCKET EVENT] payment:failed received!", data);
    });

    socket.on("payment:cancelled", () => {
      console.log("\n[SOCKET EVENT] payment:cancelled received!");
    });

    // Wait a brief moment for socket connection & room joining to register
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 3. Initiate payment session for ₹75
    console.log("\nInitiating merchant POS payment session for ₹75...");
    const initRes = await fetch(`${API_BASE}/api/merchants/me/pos/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ amount: 75 })
    });
    
    if (!initRes.ok) {
      throw new Error(`POS initiate failed with status ${initRes.status}: ${await initRes.text()}`);
    }

    const initData = await initRes.json();
    console.log("POS session initiated successfully:", initData);

    // Wait for the socket to register payment:waiting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 4. Simulate a palm scan on the hardware terminal
    console.log("\nSimulating palm scan verification...");
    const scanRes = await fetch(`${API_BASE}/api/hardware/verify-scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        biometric_hash: "8db016202a60d6147ac8f6cd1d8e18a08358f14e141ad3d933a5a69c29d53824",
        merchant_id: 1,
        amount: 75
      })
    });
    
    if (!scanRes.ok) {
      throw new Error(`Hardware verify-scan failed with status ${scanRes.status}: ${await scanRes.text()}`);
    }

    const scanData = await scanRes.json();
    console.log("Hardware verify-scan completed successfully:", scanData);

    // Wait for socket to register payment:success
    await new Promise((resolve) => setTimeout(resolve, 1500));

    socket.disconnect();

    console.log("\n=== SYNC SUMMARY ===");
    console.log("Received 'payment:waiting':", receivedWaiting ? "YES (SUCCESS)" : "NO (FAILED)");
    console.log("Received 'payment:success':", receivedSuccess ? "YES (SUCCESS)" : "NO (FAILED)");

    if (receivedWaiting && receivedSuccess) {
      console.log("\n✅ SUCCESS: REAL-TIME FRONTEND-BACKEND-HARDWARE SYNC WORKING PERFECTLY!");
      process.exit(0);
    } else {
      console.error("\n❌ FAILED: Did not receive expected real-time events via socket.");
      process.exit(1);
    }
    
  } catch (err: any) {
    console.error("Test failed with error:", err.message);
    process.exit(1);
  }
}

runTest();
