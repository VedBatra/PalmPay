import paramiko
import os
import sys
import time

def upload_and_run_capture():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    # We will write the pi capture script directly to the Pi
    pi_script = """
import cv2
import time
from picamera2 import Picamera2
import RPi.GPIO as GPIO

IR_LED_PINS = [18, 24]

try:
    GPIO.setmode(GPIO.BCM)
    for pin in IR_LED_PINS:
        GPIO.setup(pin, GPIO.OUT)
        GPIO.output(pin, GPIO.HIGH)
        
    print("Initializing Picamera2...")
    camera = Picamera2()
    camera.configure(camera.create_still_configuration())
    camera.start()
    time.sleep(2)
    
    print("Capturing array...")
    frame = camera.capture_array()
    camera.stop()
    
    # Turn off IR LEDs
    for pin in IR_LED_PINS:
        GPIO.output(pin, GPIO.LOW)
    GPIO.cleanup()
    
    print("Processing image for vein visibility...")
    # Save raw image
    cv2.imwrite('/tmp/test_raw.jpg', frame)
    print("Saved raw image to /tmp/test_raw.jpg")
    
    # Process with grayscale and CLAHE to enhance veins
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    
    # Measure average brightness and edge count
    avg_brightness = gray.mean()
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    non_zero_edges = cv2.countNonZero(edges)
    
    print(f"Captured frame stats: Brightness = {avg_brightness:.2f}, Edge Count = {non_zero_edges}")
    
    cv2.imwrite('/tmp/test_enhanced.jpg', enhanced)
    print("Saved enhanced image to /tmp/test_enhanced.jpg")
    
    print("Capture process completed successfully!")
except Exception as e:
    print("Error during capture:", e)
    try:
        GPIO.cleanup()
    except:
        pass
"""

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        # 1. Stop background scanner
        print("Temporarily stopping background scanner on the Pi to release the camera...")
        ssh.exec_command("pkill -f biopay_scanner.py")
        time.sleep(1)
        
        # 2. Write script to Pi
        print("Writing capture script to Pi...")
        sftp = ssh.open_sftp()
        with sftp.file("/home/palmpay/capture_test.py", "w") as f:
            f.write(pi_script)
        sftp.close()
        
        # 3. Run script on Pi
        print("Running capture script on Pi...")
        stdin, stdout, stderr = ssh.exec_command("python3 /home/palmpay/capture_test.py")
        print("STDOUT:")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        print("STDERR:")
        print(stderr.read().decode('utf-8', errors='replace').strip())
        
        # 4. Download the captured images to laptop workspace
        print("Downloading images to laptop workspace...")
        sftp = ssh.open_sftp()
        local_dir = r"c:\Users\Ved\OneDrive\Desktop\Bio-Pay-Access\Bio-Pay-Access\artifacts"
        os.makedirs(local_dir, exist_ok=True)
        
        try:
            sftp.get("/tmp/test_raw.jpg", os.path.join(local_dir, "test_raw.jpg"))
            print("Downloaded test_raw.jpg successfully!")
        except Exception as e:
            print("Could not download test_raw.jpg:", e)
            
        try:
            sftp.get("/tmp/test_enhanced.jpg", os.path.join(local_dir, "test_enhanced.jpg"))
            print("Downloaded test_enhanced.jpg successfully!")
        except Exception as e:
            print("Could not download test_enhanced.jpg:", e)
            
        sftp.close()
        
        # 5. Restart background scanner
        print("Restarting background scanner service on the Pi...")
        bg_cmd = "nohup python3 -u /home/palmpay/biopay_scanner.py > /tmp/biopay_scanner.log 2>&1 &"
        ssh.exec_command(bg_cmd)
        time.sleep(1)
        
        ssh.close()
        print("Done!")
    except Exception as e:
        print("SSH/SFTP error:", e)

if __name__ == "__main__":
    upload_and_run_capture()
