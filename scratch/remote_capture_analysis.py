import paramiko
import sys
import time

def remote_capture_and_analyze():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=username, password=password, timeout=15)
    
    # 1. Stop background scanner to free camera
    print("Stopping background scanner to free camera...")
    ssh.exec_command("pkill -f biopay_scanner.py")
    time.sleep(2)
    
    # Python code to capture and analyze on Pi
    pi_code = """
import cv2
import numpy as np
import RPi.GPIO as GPIO
import time
from picamera2 import Picamera2

# Setup IR LEDs
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
IR_LED_PINS = [18, 24]
for pin in IR_LED_PINS:
    GPIO.setup(pin, GPIO.OUT)
    GPIO.output(pin, GPIO.LOW)

# Initialize camera
print("Initializing camera on Pi...")
camera = Picamera2()
config = camera.create_still_configuration()
camera.configure(config)
camera.start()

# Turn on IR LEDs and capture
print("Capturing frame...")
for pin in IR_LED_PINS:
    GPIO.output(pin, GPIO.HIGH)
time.sleep(0.15)

try:
    frame = camera.capture_array()
finally:
    for pin in IR_LED_PINS:
        GPIO.output(pin, GPIO.LOW)
    camera.stop()
    camera.close()

print(f"Captured frame dimensions: {frame.shape}")

gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
enhanced = clahe.apply(gray)
blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

edge_count = cv2.countNonZero(edges)
print(f"Total Canny edge pixels: {edge_count}")

resized = cv2.resize(edges, (32, 32), interpolation=cv2.INTER_AREA)

for thresh in [1, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 100]:
    _, binary_edges = cv2.threshold(resized, thresh, 255, cv2.THRESH_BINARY)
    active_cells = cv2.countNonZero(binary_edges)
    density_pct = (active_cells / 1024.0) * 100.0
    print(f"Threshold: {thresh:3d} | Active Cells (Ones): {active_cells:4d} / 1024 | Density: {density_pct:5.2f}%")
"""
    
    # Write python code to /tmp/capture_and_analyze.py
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/capture_and_analyze.py', 'w') as f:
        f.write(pi_code)
    sftp.close()
    
    # Run the script on the Pi
    print("Executing capture and analysis on Pi...")
    stdin, stdout, stderr = ssh.exec_command("python3 /tmp/capture_and_analyze.py")
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    
    print("\n--- STDOUT ---")
    print(out)
    print("--- STDERR ---")
    print(err)
    
    # 2. Restart background scanner
    print("Restarting background scanner...")
    bg_cmd = "nohup env OLED_DRIVER=ssd1306 python3 -u /home/palmpay/biopay_scanner.py > /tmp/biopay_scanner.log 2>&1 &"
    ssh.exec_command(bg_cmd)
    time.sleep(2)
    
    # Check process is running
    _, p_out, _ = ssh.exec_command("pgrep -a -f biopay_scanner.py")
    procs = p_out.read().decode().strip()
    print(f"Scanner process status:\\n{procs}")
    
    ssh.close()

if __name__ == "__main__":
    remote_capture_and_analyze()
