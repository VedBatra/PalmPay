import RPi.GPIO as GPIO
import time
import requests
import hashlib
import cv2
from picamera2 import Picamera2
import os
import numpy as np

# Configuration from env vars or defaults
OLED_DRIVER = os.getenv("OLED_DRIVER", "ssd1306")
try:
    addr_str = os.getenv("OLED_ADDR", "0x3C")
    OLED_ADDR = int(addr_str, 16)
except:
    OLED_ADDR = 0x3C

API_SERVER = os.getenv("API_SERVER", "http://10.250.112.186:8080")
MERCHANT_ID = os.getenv("MERCHANT_ID", "1")
IR_SENSOR_PIN = int(os.getenv("IR_SENSOR_PIN", "23"))
IR_LED_PINS = [18, 24]

OLED_AVAILABLE = False
oled = None

def init_oled(force=False):
    global oled, OLED_AVAILABLE, _oled_init_attempts
    if not force and OLED_AVAILABLE and oled is not None:
        return
    if force:
        _oled_init_attempts = 0  # Reset retry counter on forced init
    try:
        from luma.core.interface.serial import i2c
        serial = i2c(port=1, address=OLED_ADDR)
        if OLED_DRIVER.lower() == "sh1106":
            from luma.oled.device import sh1106
            oled = sh1106(serial)
        else:
            from luma.oled.device import ssd1306
            oled = ssd1306(serial)
        oled.contrast(255)  # Max contrast
        OLED_AVAILABLE = True
        print(f"OLED: Connected/Recovered at {hex(OLED_ADDR)} using {OLED_DRIVER} driver")
    except Exception as e:
        print(f"OLED: Initialization/Recovery failed ({e})")
        OLED_AVAILABLE = False

_oled_init_attempts = 0
_OLED_MAX_RETRIES = 3  # Stop retrying after 3 failed inits per boot

def show_message(line1, line2=""):
    global OLED_AVAILABLE, _oled_init_attempts
    print(f"[SCREEN] {line1} | {line2}")
    if not OLED_AVAILABLE:
        if _oled_init_attempts < _OLED_MAX_RETRIES:
            _oled_init_attempts += 1
            init_oled()
    if not OLED_AVAILABLE:
        return
    try:
        from luma.core.render import canvas
        with canvas(oled) as draw:
            draw.text((0,  0), "  BioPay",  fill="white")
            draw.line([(0, 12), (128, 12)], fill="white", width=1)
            draw.text((0, 20), line1,       fill="white")
            draw.text((0, 36), line2,       fill="white")
    except Exception as e:
        print(f"OLED Draw error: {e}")
        OLED_AVAILABLE = False

def extract_biometric_hash(image_array):
    gray     = cv2.cvtColor(image_array, cv2.COLOR_BGR2GRAY)
    
    # 1. Brightness check (on raw grayscale)
    avg_brightness = gray.mean()
    print(f"Captured Frame Average Brightness: {avg_brightness:.2f}")
    if avg_brightness < 12.0:
        raise ValueError("Too Dark - Place Hand Properly")
        
    clahe    = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred  = cv2.GaussianBlur(enhanced, (5, 5), 0)
    edges    = cv2.Canny(blurred, 50, 150)
    
    # 2. Edge Density Check
    non_zero_edges = cv2.countNonZero(edges)
    print(f"Captured Frame Edge Count: {non_zero_edges}")
    
    # Resolution is 2592x1944. Calibrated threshold for IR-illuminated palm captures.
    if non_zero_edges < 1000:
        raise ValueError("Insufficient Detail - Align Palm")
        
    # 3. Dynamic Top-K Spatial Edge Grid Downsampling (for robust multi-user physical pattern matching)
    # This prevents the template from becoming fully saturated (all ones) when Canny edge count is very high.
    resized = cv2.resize(edges, (32, 32), interpolation=cv2.INTER_AREA)
    flat_resized = resized.flatten()
    
    # Sort indices in ascending order
    sorted_indices = np.argsort(flat_resized)
    
    # Select the top 15% (153 out of 1024) densest cells
    num_cells = 1024
    k_percent = 15
    num_ones = int(num_cells * (k_percent / 100.0))
    
    flat = np.zeros(num_cells, dtype=int)
    top_indices = sorted_indices[-num_ones:]
    for idx in top_indices:
        if flat_resized[idx] > 0:
            flat[idx] = 1
    
    # Pack 1024 bits into 128 bytes
    packed_bytes = bytearray()
    for i in range(0, len(flat), 8):
        byte_val = 0
        for bit in range(8):
            if flat[i + bit]:
                byte_val |= (1 << (7 - bit))
        packed_bytes.append(byte_val)
        
    hex_template = packed_bytes.hex()
    print(f"Extracted 32x32 Palm Grid (256 hex chars): {hex_template[:16]}...{hex_template[-16:]}")
    return hex_template

def capture_frame_with_leds():
    # Turn on IR LEDs
    for pin in IR_LED_PINS:
        GPIO.output(pin, GPIO.HIGH)
    time.sleep(0.15) # Allow LEDs to fully power on and sensor to adjust exposure
    try:
        frame = camera.capture_array()
    finally:
        # Turn off IR LEDs
        for pin in IR_LED_PINS:
            GPIO.output(pin, GPIO.LOW)
    return frame

def send_heartbeat():
    try:
        requests.post(f"{API_SERVER}/api/hardware/heartbeat",
                      json={"kiosk_id": f"KIOSK_{MERCHANT_ID}"}, timeout=3)
        print("Heartbeat sent.")
    except Exception as e:
        print(f"Heartbeat failed: {e}")

def verify_payment(bio_hash, amount):
    try:
        r = requests.post(f"{API_SERVER}/api/hardware/verify-scan",
                          json={"biometric_hash": bio_hash,
                                "merchant_id": int(MERCHANT_ID),
                                "amount": amount}, timeout=10)
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"success": False, "message": "Server unreachable"}
    except Exception as e:
        return {"success": False, "message": str(e)}

def register_enrollment_scan(bio_hash):
    try:
        r = requests.post(f"{API_SERVER}/api/hardware/register-scan",
                          json={"biometric_hash": bio_hash,
                                "merchant_id": int(MERCHANT_ID)}, timeout=10)
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"success": False, "message": "Server unreachable"}
    except Exception as e:
        return {"success": False, "message": str(e)}

def check_active_session():
    try:
        r = requests.get(f"{API_SERVER}/api/hardware/active-session/{MERCHANT_ID}", timeout=2)
        if r.status_code == 200:
            data = r.json()
            if data.get("active"):
                return True, data.get("amount"), data.get("session_id")
    except Exception as e:
        print(f"Error checking active session: {e}")
    return False, None, None

def check_active_enrollment():
    try:
        r = requests.get(f"{API_SERVER}/api/hardware/active-enrollment/{MERCHANT_ID}", timeout=2)
        if r.status_code == 200:
            data = r.json()
            if data.get("active"):
                return True, data.get("user_name"), data.get("session_id")
    except Exception as e:
        print(f"Error checking active enrollment: {e}")
    return False, None, None

def run_scan_sequence(amount, immediate=False):
    print(f"Starting scan sequence for amount: Rs.{amount}")
    
    max_retries = 3
    
    # Re-initialize OLED before starting sequence to ensure it is awake
    init_oled(force=True)
    
    if not immediate:
        show_message(f"Pay Rs.{amount}", "Place Palm...")
        
        # Wait for hand to be physically detected before starting countdown
        hand_detected = False
        check_tick = 0
        while not hand_detected:
            if GPIO.input(IR_SENSOR_PIN) == GPIO.LOW:
                hand_detected = True
                break
            
            # Every 1.0 second, check if the session is still active on the server
            check_tick += 1
            if check_tick >= 10:
                check_tick = 0
                active, _, _ = check_active_session()
                if not active:
                    print("Payment session cancelled on server. Aborting scan.")
                    return False
            time.sleep(0.1)
            
        # Give a short 2-second hold-still countdown
        for sec in [2, 1]:
            show_message(f"Pay Rs.{amount}", f"Hold still... {sec}s")
            time.sleep(1)
                
    # Keep OLED displaying Scanning/Processing for the whole internal loop
    show_message("Scanning...", "Hold still")
    time.sleep(0.2)

    for attempt in range(1, max_retries + 1):
        print(f"--- Internal Scan Attempt {attempt}/{max_retries} ---")
        
        try:
            frame = capture_frame_with_leds()
            print(f"Attempt {attempt} frame captured successfully!")
        except Exception as e:
            print(f"Camera capture error: {e}")
            time.sleep(1)
            continue

        # CRITICAL: Re-initialize OLED immediately after capture to recover from power-draw brownouts
        init_oled(force=True)
        show_message("Processing...", "Please wait")
        
        try:
            actual_hash = extract_biometric_hash(frame)
            print(f"Actual Image Hash: {actual_hash}")
        except ValueError as ve:
            print(f"Validation failure: {ve}")
            init_oled(force=True)
            show_message("SCAN ERROR", str(ve))
            time.sleep(1.5)
            if attempt < max_retries:
                init_oled(force=True)
                show_message("Scanning...", "Hold still")
            continue
        except Exception as e:
            print(f"Hash extraction error: {e}")
            time.sleep(1)
            continue
            
        print(f"Transmitted Hash: {actual_hash}")
        
        result = verify_payment(actual_hash, amount)
        error_msg = result.get("error") or result.get("message") or "Try again"
        
        if result.get("success"):
            init_oled(force=True)
            show_message("SUCCESS!", f"Paid Rs.{amount}")
            print("Payment Successful!")
            time.sleep(4)
            return True
            
        # Check if we should stop retrying (e.g., insufficient balance)
        if "balance" in error_msg.lower():
            init_oled(force=True)
            show_message("FAILED", error_msg[:20])
            print(f"Failed (No Retry): {error_msg}")
            time.sleep(4)
            return False
            
        # Unrecognized biometric - just sleep briefly and retry internally
        print(f"Internal mismatch attempt {attempt}: {error_msg}")
        # Show scanning again for the next internal loop if not the last one
        if attempt < max_retries:
            init_oled(force=True)
            show_message("Scanning...", "Hold still")
            time.sleep(1) # wait 1 sec before taking next internal scan
            
    # All retries exhausted
    init_oled(force=True)
    show_message("FAILED", "Not recognized")
    print(f"Failed: Exhausted {max_retries} internal retries.")
    time.sleep(4)
    return False

def run_enrollment_sequence(user_name, immediate=False):
    print(f"Starting multi-scan enrollment sequence for user: {user_name}")
    
    # Re-initialize OLED before starting sequence to ensure it is awake
    init_oled(force=True)
    
    hashes = []
    scans_needed = 3
    step = 1
    
    while step <= scans_needed:
        step_attempts = 0
        step_success = False
        
        while step_attempts < 3:
            init_oled(force=True)
            
            if step == 1:
                msg1 = "Scan 1/3: Center"
                msg2 = "Place Palm"
                show_message(msg1, msg2)
                
                # Wait for hand to be physically detected before starting countdown
                hand_detected = False
                check_tick = 0
                while not hand_detected:
                    if GPIO.input(IR_SENSOR_PIN) == GPIO.LOW:
                        hand_detected = True
                        break
                    check_tick += 1
                    if check_tick >= 10:
                        check_tick = 0
                        active, _, _ = check_active_enrollment()
                        if not active:
                            print("Enrollment session cancelled on server. Aborting.")
                            return False
                    time.sleep(0.1)
            else:
                msg1 = f"Scan {step}/3: Shift"
                msg2 = "Lift & Shift Palm"
                show_message(msg1, msg2)
                
                # Wait for hand to be lifted (IR_SENSOR_PIN goes HIGH / no hand)
                lift_start = time.time()
                while GPIO.input(IR_SENSOR_PIN) == GPIO.LOW:
                    if time.time() - lift_start > 10.0: # Give them up to 10 seconds to lift hand
                        break
                    time.sleep(0.1)
                
                show_message(msg1, "Place Palm Again")
                
                # Wait for hand to be placed (IR_SENSOR_PIN goes LOW / hand detected)
                hand_detected = False
                check_tick = 0
                while not hand_detected:
                    if GPIO.input(IR_SENSOR_PIN) == GPIO.LOW:
                        hand_detected = True
                        break
                    check_tick += 1
                    if check_tick >= 10:
                        check_tick = 0
                        active, _, _ = check_active_enrollment()
                        if not active:
                            print(f"Enrollment session cancelled on server while waiting for Scan {step}.")
                            return False
                    time.sleep(0.1)
                    
            # 2-second hold-still countdown once hand is confirmed present
            for sec in [2, 1]:
                show_message(msg1, f"Hold still... {sec}s")
                time.sleep(1)
                
            show_message("Scanning...", "Hold still")
            time.sleep(0.2)
            
            try:
                frame = capture_frame_with_leds()
                print(f"Scan {step} frame captured successfully!")
            except Exception as e:
                print(f"Camera capture error on scan {step}: {e}")
                show_message("CAMERA ERROR", "Retrying scan...")
                time.sleep(2)
                step_attempts += 1
                continue
                
            # CRITICAL: Re-initialize OLED immediately after capture to recover from power-draw brownouts
            init_oled(force=True)
            show_message("Processing...", "Please wait")
            
            try:
                h = extract_biometric_hash(frame)
                print(f"Scan {step} hash: {h}")
                hashes.append(h)
                step_success = True
                step += 1
                break
            except ValueError as ve:
                print(f"Validation failure: {ve}")
                init_oled(force=True)
                show_message("SCAN ERROR", str(ve))
                time.sleep(2.0)
                step_attempts += 1
                continue
            except Exception as e:
                print(f"Hash extraction error on scan {step}: {e}")
                show_message("HASH ERROR", "Retrying scan...")
                time.sleep(2)
                step_attempts += 1
                continue
                
        if not step_success:
            print(f"Enrollment aborted: Step {step} failed after 3 attempts.")
            init_oled(force=True)
            show_message("ENROLL FAILED", "Validation timeout")
            time.sleep(4)
            return False

    actual_hash = ",".join(hashes)
    show_message("Registering...", "Please wait")
    result = register_enrollment_scan(actual_hash)
    
    if result.get("success"):
        show_message("ENROLLED!", f"Welcome {user_name[:10]}")
        print(f"Biometric enrolled successfully for {user_name} with {len(hashes)} templates!")
        time.sleep(4)
        return True
    else:
        msg = result.get("message", "Try again")
        show_message("FAILED", msg[:20])
        print(f"Failed to enroll: {msg}")
        time.sleep(4)
        return False

# GPIO & Camera Setup
GPIO.setmode(GPIO.BCM)
GPIO.setup(IR_SENSOR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
for pin in IR_LED_PINS:
    GPIO.setup(pin, GPIO.OUT)
    GPIO.output(pin, GPIO.LOW)

print("Initializing camera...")
camera = Picamera2()
camera.configure(camera.create_still_configuration())
camera.start()
time.sleep(2)
print("Camera initialized.")

# Initial OLED boot screen
init_oled(force=True)
show_message("Ready", "Place Palm to Pay")
print("BioPay Scanner is running! Press Ctrl+C to stop.")

last_processed_session_id = None
last_processed_session_type = None
last_session_failed = False
heartbeat_tick = 0

try:
    while True:
        heartbeat_tick += 1
        if heartbeat_tick >= 15:  # roughly every 15 seconds
            send_heartbeat()
            heartbeat_tick = 0
            
        # 1. Read IR sensor state
        ir_triggered = (GPIO.input(IR_SENSOR_PIN) == GPIO.LOW)
        
        # 2. Poll active sessions from server
        active_pay, amount, pay_session_id = check_active_session()
        active_enroll, user_name, enroll_session_id = check_active_enrollment()
        
        if active_pay:
            # We have a pending payment session!
            is_new = (pay_session_id != last_processed_session_id or last_processed_session_type != 'PAY')
            
            # We trigger a scan IF:
            # - It's a new session, OR
            # - The physical IR sensor was just triggered (and we haven't succeeded yet)
            if is_new or (ir_triggered and last_session_failed):
                if is_new:
                    print(f"New payment session detected: {pay_session_id} for Rs.{amount}")
                    last_processed_session_id = pay_session_id
                    last_processed_session_type = 'PAY'
                    last_session_failed = False
                    # For a brand new session, start scan sequence with a short countdown
                    success = run_scan_sequence(amount, immediate=False)
                else:
                    print(f"IR sensor triggered retry for active payment session: {pay_session_id}")
                    # For physical trigger, start scan immediately
                    success = run_scan_sequence(amount, immediate=True)
                
                last_session_failed = not success
                init_oled(force=True)
                show_message("Ready", "Place Palm to Pay")
            else:
                # Same session, no physical trigger, wait silently
                pass
                
        elif active_enroll:
            # We have an active enrollment session!
            is_new = (enroll_session_id != last_processed_session_id or last_processed_session_type != 'ENROLL')
            
            if is_new or (ir_triggered and last_session_failed):
                if is_new:
                    print(f"New enrollment session detected: {enroll_session_id} for {user_name}")
                    last_processed_session_id = enroll_session_id
                    last_processed_session_type = 'ENROLL'
                    last_session_failed = False
                    success = run_enrollment_sequence(user_name, immediate=False)
                else:
                    print(f"IR sensor triggered retry for active enrollment session: {enroll_session_id}")
                    success = run_enrollment_sequence(user_name, immediate=True)
                
                last_session_failed = not success
                init_oled(force=True)
                show_message("Ready", "Place Palm to Pay")
            else:
                # Same session, no physical trigger, wait silently
                pass
                
        else:
            # No active session on the server
            if last_processed_session_id is not None:
                print("Session cleared on server. Resetting client session state.")
                last_processed_session_id = None
                last_processed_session_type = None
                last_session_failed = False
                
            # If the physical IR sensor is triggered but there is no active session
            if ir_triggered:
                init_oled(force=True)
                show_message("No Active Txn", "Start from POS")
                print("Hand detected physically, but no active session or enrollment exists.")
                time.sleep(2)
                init_oled(force=True)
                show_message("Ready", "Place Palm to Pay")
                # Wait until hand is removed to prevent repeating
                while GPIO.input(IR_SENSOR_PIN) == GPIO.LOW:
                    time.sleep(0.2)
                    
        time.sleep(1.0)
        
except KeyboardInterrupt:
    print("Stopped by user.")
    GPIO.cleanup()
    camera.stop()
    if OLED_AVAILABLE and oled is not None:
        try:
            oled.cleanup()
        except:
            pass
