# PalmPay (BioPay) — Complete Technical System Architecture & Documentation

## 1. Executive Summary & Conceptual Overview

**PalmPay (BioPay)** is an end-to-end multi-tenant contactless biometric payment and identity verification platform. It allows users to make secure financial transactions at point-of-sale (POS) terminals using only their palm lines and subcutaneous vein structures, eliminating the need for physical debit cards, smartphones, or passwords.

### Core Value Proposition:
- **Contactless & Hygienic:** Uses optical infrared sensing without requiring physical skin touch.
- **Liveness & Fraud Resistance:** Subsurface palm vein structures and micro-wrinkles are unique to every individual and cannot be easily photographed, copied, or spoofed using 2D color images.
- **Sub-Second Latency:** Hardware-accelerated feature extraction and bitwise matrix similarity calculations enable matching against stored biometric templates in under **200 milliseconds**.

---

## 2. Algorithms, AI/ML Models & Mathematics

The system leverages advanced computer vision, digital image processing, and discrete spatial mathematics:

```
┌─────────────────┐    ┌───────────────────┐    ┌─────────────────────┐
│ NIR IR Optical  │ ──>│  ROI Spatial      │ ──>│ CLAHE Contrast      │
│ Frame Capture   │    │  Center Crop      │    │ Enhancement         │
└─────────────────┘    └───────────────────┘    └─────────────────────┘
                                                           │
                                                           ▼
┌─────────────────┐    ┌───────────────────┐    ┌─────────────────────┐
│ 1024-Bit Matrix │ <──│ Peak-Density      │ <──│ Adaptive Multi-Scale│
│ Binarization    │    │ Spatial Downsample│    │ Canny Edge Search   │
└─────────────────┘    └───────────────────┘    └─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Jaccard Similarity Matching Score (Intersection over Union) │
│            J(A, B) = |A ∩ B| / |A ∪ B|                      │
└─────────────────────────────────────────────────────────────┘
```

### A. Near-Infrared (NIR) Subsurface Illumination
- **Physics:** Hemoglobin in blood vessels absorbs near-infrared light at wavelengths between **850nm and 940nm**. When illuminated by IR LEDs (connected to GPIO 18 & 24), subcutaneous veins appear as darker line patterns compared to surrounding skin tissues.
- **Hardware:** OV5647 5MP IR Camera Module with removable IR cut filter + dual 850nm IR LED illuminator boards.

### B. ROI (Region of Interest) Spatial Cropping
- **Purpose:** Eliminates background noise, fingers, wrist contours, and outer silhouette variations.
- **Math:** Crops the central 50% region of interest from the raw 2592x1944 frame:
  $$\text{crop\_h} = 0.50 \times H, \quad \text{crop\_w} = 0.50 \times W$$
  $$Y_{1} = \frac{H - \text{crop\_h}}{2}, \quad X_{1} = \frac{W - \text{crop\_w}}{2}$$

### C. CLAHE (Contrast Limited Adaptive Histogram Equalization)
- **Purpose:** Prevents over-amplification of noise while enhancing subtle vascular and wrinkle line contrasts under non-uniform IR illumination.
- **Parameters:** `clipLimit = 3.0`, `tileGridSize = (8, 8)`.

### D. Adaptive Multi-Scale Canny Edge Detection
- **Adaptive Thresholding:** To accommodate varying hand distances, skin tones, and ambient lighting, the algorithm evaluates descending hysteresis threshold pairs:
  1. $(40, 120)$ — Crisp / Sharp focus
  2. $(25, 75)$ — Soft focus
  3. $(15, 45)$ — Blurry focus
  4. $(10, 30)$ — Out-of-focus macro fallback
- **Vignette Masking:** Zeroes out the outer 15% boundary of the cropped matrix to eliminate lens distortion artifacts.

### E. Peak-Density Spatial Grid Binarization
- **Downsampling:** Resizes edge-detected frames to a $32 \times 32$ spatial cell matrix ($1,024$ total spatial locations).
- **Adaptive Peak Thresholding:** Calculates the maximum local edge density across all cells ($\text{peak\_density}$) and applies a relative threshold:
  $$\text{Threshold} = \max(\text{peak\_density} \times 0.50, \, 10.0)$$
- **Bit Packing:** Cells meeting the threshold are assigned bit `1`, packing 1024 bits into **128 bytes** (represented as a 256-character hexadecimal string).

### F. Jaccard Similarity & Bitwise Distance Matching
- **Intersection over Union (IoU):** To compare a query scan $A$ with a stored template $B$:
  $$J(A, B) = \frac{\text{popcount}(A \text{ AND } B)}{\text{popcount}(A \text{ OR } B)}$$
- **Match Calibration:**
  - **Match Success:** $J(A, B) \ge 0.10$ (10%+ spatial line alignment) with a minimum separation margin ($\Delta \ge 0.001$) above runner-up candidates.
  - **Collision Protection:** Enrollment scans are cross-checked against all registered users; any registration attempt with $J(A, B) \ge 0.40$ against another user is blocked as a biometric collision.

---

## 3. Libraries, Frameworks & Technological Stack

### 🐍 Embedded Systems & Raspberry Pi (Python)
- **`Picamera2`:** Official Raspberry Pi camera library for high-speed libcamera still/array captures.
- **`RPi.GPIO`:** Low-level GPIO pin control for IR Proximity Sensor (pin 23) and IR LEDs (pins 18 & 24).
- **`luma.oled` & `luma.core`:** Micro-display rendering library driving the 0.96" SSD1306 OLED screen over I2C (`0x3C`).
- **`OpenCV (cv2)`:** Headless computer vision library (`opencv-python-headless`) for image transformations, CLAHE, Gaussian blur, Canny edge extraction, and bitwise packing.
- **`NumPy`:** Fast C-accelerated array math for matrix manipulation and density histograms.
- **`Paramiko`:** Python SSH2/SFTP protocol implementation used for automated remote Pi deployment and diagnostics.

### ⚡ Backend API Server (Node.js & Express)
- **`Express.js`:** HTTP REST API server handling hardware endpoints, user auth, merchant checkouts, and wallet top-ups.
- **`Drizzle ORM`:** Type-safe SQL query engine powering PostgreSQL database operations.
- **`Socket.io`:** Real-time bi-directional WebSocket server emitting live payment/enrollment progress events to web clients.
- **`Zod`:** Runtime schema validation for API payloads.
- **`Orval`:** Automated OpenAPI specification and TypeScript client generator.

### 💻 Frontend Web Application (React & Vite)
- **`React 18`:** Single-Page Application (SPA) framework for POS terminals and User dashboards.
- **`Vite`:** Lightning-fast frontend build tool and hot-module-reloading (HMR) server.
- **`TailwindCSS` & `Shadcn UI`:** Modern utility-first CSS design system with dark mode glassmorphism interface components.
- **`TanStack React Query`:** Async data-fetching, caching, and optimistic UI state management.

---

## 4. Codebase Structure & File Responsibilities

### 📂 Root Directory Files
- **[`biopay_scanner.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/biopay_scanner.py):** Main Raspberry Pi hardware service daemon. Controls GPIO pins, camera capture, CLAHE/Canny image processing, OLED screen rendering, server polling loop, and 3-second auto-start fallback logic.
- **[`upload_scanner.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/upload_scanner.py):** Automated SFTP deployment script that uploads updated `biopay_scanner.py` code to the Raspberry Pi over Wi-Fi.
- **[`restart_scanner.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/restart_scanner.py):** Remote SSH controller that terminates old scanner processes and starts the new scanner service in the background with `nohup`.
- **[`run_ir_test.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/run_ir_test.py):** Hardware test utility verifying IR Proximity Sensor GPIO 23 state transitions.
- **[`run_oled_diag.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/run_oled_diag.py):** I2C diagnostic script testing SSD1306/SH1106 OLED display drivers on address `0x3C`.
- **[`pi_capture_test.py`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/pi_capture_test.py):** Diagnostic script that captures test palm frames from the Pi and downloads raw & enhanced images locally.
- **[`package.json`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/package.json) & [`pnpm-workspace.yaml`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/pnpm-workspace.yaml):** Root monorepo configuration defining pnpm workspace packages.

### 📂 Backend API Server (`artifacts/api-server/`)
- **[`artifacts/api-server/src/index.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/api-server/src/index.ts):** Express server entry point, registering middleware, CORS, HTTP routes, and WebSocket server setup.
- **[`artifacts/api-server/src/routes/hardware.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/api-server/src/routes/hardware.ts):** Hardware API endpoints:
  - `GET /api/hardware/active-session/:merchant_id` — Returns active payment session status.
  - `GET /api/hardware/active-enrollment/:merchant_id` — Returns active palm enrollment status.
  - `POST /api/hardware/verify-scan` — Receives biometric hash from Pi, computes Jaccard matching score against DB, deducts balance, and records transaction.
  - `POST /api/hardware/register-scan` — Performs collision checks and saves multi-scan palm templates for new users.
  - `POST /api/hardware/heartbeat` — Updates hardware online status and last-seen timestamp.
- **[`artifacts/api-server/src/lib/biometrics.js`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/api-server/src/lib/biometrics.js):** Mathematical biometrics library calculating Jaccard similarity scores, bitwise population counts (`popcount`), and blacklisted blank-scan filtering.
- **[`artifacts/api-server/src/routes/merchants.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/api-server/src/routes/merchants.ts):** Merchant management routes (POS checkout initiation, transaction history, balance stats).
- **[`artifacts/api-server/src/routes/users.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/api-server/src/routes/users.ts):** User account registration, wallet top-up, profile management, and palm enrollment sessions.

### 📂 Frontend Web App (`artifacts/biopay/`)
- **[`artifacts/biopay/src/App.tsx`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/biopay/src/App.tsx):** Main React application routing and top-level navigation layout.
- **[`artifacts/biopay/src/pages/MerchantPos.tsx`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/biopay/src/pages/MerchantPos.tsx):** Point-of-Sale merchant terminal interface where cashiers enter amounts and trigger live palm payments.
- **[`artifacts/biopay/src/pages/Enrollment.tsx`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/biopay/src/pages/Enrollment.tsx):** Guided 3-step palm biometric registration wizard.
- **[`artifacts/biopay/src/pages/UserDashboard.tsx`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/artifacts/biopay/src/pages/UserDashboard.tsx):** User portal displaying wallet balance, transaction logs, and top-up options.

### 📂 Shared Libraries (`lib/`)
- **[`lib/db/src/schema/users.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/lib/db/src/schema/users.ts):** Drizzle ORM schema defining the `users` table (`biometric_template`, `wallet_balance`, `is_verified`).
- **[`lib/db/src/schema/merchants.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/lib/db/src/schema/merchants.ts):** Schema defining merchants, kiosk IDs, online status, and shop balances.
- **[`lib/db/src/schema/transactions.ts`](file:///c:/Users/Ved/Downloads/PalmPay-main%20%283%29/PalmPay-main/lib/db/src/schema/transactions.ts):** Transaction history ledger storing amounts, payment types, timestamps, and status (`SUCCESS`/`FAILED`).

---

## 5. Hardware Connection Diagram & Pinout Reference

```
 ┌──────────────────────────────────────┐
 │     RASPBERRY PI 40-PIN HEADER       │
 └──────────────────────────────────────┘
   Pin 1  (3.3V) ─────── OLED VCC (or Pin 2/4 5V)
   Pin 2  (5V)   ─────── IR LED VCC
   Pin 3  (SDA)  ─────── OLED SDA (I2C Data)
   Pin 5  (SCL)  ─────── OLED SCL (I2C Clock)
   Pin 6  (GND)  ─────── Common Ground (OLED & Sensors)
   Pin 18 (GPIO) ─────── IR LED Transistor / Power Switch 1
   Pin 23 (GPIO) ─────── IR Proximity Sensor Data (IN)
   Pin 24 (GPIO) ─────── IR LED Transistor / Power Switch 2
```

| Component | Pin Function | Raspberry Pi Connection | Notes |
| :--- | :--- | :--- | :--- |
| **SSD1306 OLED Display** | VCC | Physical Pin 2 (5V) / Pin 1 (3.3V) | Power Supply |
| | GND | Physical Pin 6 (Ground) | Common Ground |
| | SDA | Physical Pin 3 (GPIO 2) | I2C Data |
| | SCL | Physical Pin 5 (GPIO 3) | I2C Clock |
| **IR Proximity Sensor** | VCC | Physical Pin 4 (5V) | Power |
| | GND | Physical Pin 14 (Ground) | Common Ground |
| | OUT | Physical Pin 16 (GPIO 23) | Active LOW when hand is detected |
| **Dual IR LEDs** | VCC / EN | Physical Pin 12 (GPIO 18) & Pin 18 (GPIO 24) | High signal turns on 850nm IR light |
| **OV5647 IR Camera** | CSI Ribbon | Dedicated CSI Camera Port | Controlled via `Picamera2` |

---

## 6. End-to-End Payment Execution Workflow

1. **Transaction Request:**
   - Cashier enters ₹500 on the web frontend (`http://localhost:18682`).
   - Frontend calls `POST /api/merchants/1/charge` with `{ amount: 500 }`.
   - Backend registers an active waiting session in memory (`activeSessions.set(1, { amount: 500, status: "WAITING" })`).

2. **Hardware Notification & OLED Sync:**
   - Raspberry Pi scanner service GETs `/api/hardware/active-session/1`.
   - Returns `{ active: true, amount: 500 }`.
   - Pi updates OLED screen to display **`Pay Rs.500 | Place Palm...`**.

3. **Capture & Feature Extraction:**
   - User places hand under scanner -> IR Proximity Sensor triggers (or 3s auto-start fallback fires).
   - Pi turns on IR LEDs (GPIO 18 & 24) -> Camera takes 2592x1944 frame -> OpenCV applies CLAHE + Canny edge detection -> Downsamples to 32x32 grid -> Produces 256-hex hash.

4. **Biometric Matching & Verification:**
   - Pi sends `POST /api/hardware/verify-scan` containing `{ biometric_hash: "a3f890c2...", amount: 500 }`.
   - Server queries verified users in PostgreSQL and calculates Jaccard Similarity score:
     $$J(A, B) = \frac{|A \cap B|}{|A \cup B|}$$
   - Matches user account if similarity $\ge 10\%$ with a distinct lead over runner-up candidates.

5. **Financial Ledger Settlement:**
   - Server checks user wallet balance ($\ge ₹500$).
   - Executes atomic SQL transaction:
     - Deducts ₹500 from `users.wallet_balance`.
     - Adds ₹500 to `merchants.merchant_balance`.
     - Inserts record into `transactions` table with status `SUCCESS`.

6. **User Feedback & Completion:**
   - Server responds `{ success: true, user_name: "Rahul", amount: 500 }`.
   - Pi OLED displays **`SUCCESS! Paid Rs.500`**.
   - Socket.io broadcasts `payment:success` to the web POS, displaying a green confirmation screen.
