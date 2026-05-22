import paramiko
import time

def upload_and_run_ir_test():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    pi_script = """
import RPi.GPIO as GPIO
import time
import sys

IR_SENSOR_PIN = 23
GPIO.setmode(GPIO.BCM)
GPIO.setup(IR_SENSOR_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)

print("Starting IR Proximity Sensor test...")
print("Wave your hand in front of the sensor to see transitions.")
print("If the value does not change, try adjusting the physical potentiometer (sensitivity screw) on the sensor board.")
print("This test will run for 20 seconds...")
print("-" * 50)

last_state = -1
start_time = time.time()

try:
    while time.time() - start_time < 20:
        state = GPIO.input(IR_SENSOR_PIN)
        if state != last_state:
            status = "HAND DETECTED! (LOW / 0)" if state == GPIO.LOW else "NO HAND (HIGH / 1)"
            print(f"[{time.strftime('%H:%M:%S')}] State changed to: {status}")
            last_state = state
        time.sleep(0.1)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()
    print("IR Sensor test finished.")
"""

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        # 1. Stop background scanner
        print("Stopping background scanner on the Pi...")
        ssh.exec_command("pkill -f biopay_scanner.py")
        time.sleep(1)
        
        # 2. Write script to Pi
        print("Writing test_ir_sensor.py to Pi...")
        sftp = ssh.open_sftp()
        with sftp.file("/home/palmpay/test_ir_sensor.py", "w") as f:
            f.write(pi_script)
        sftp.close()
        
        # 3. Run script on Pi
        print("Running test_ir_sensor.py on Pi...")
        stdin, stdout, stderr = ssh.exec_command("python3 /home/palmpay/test_ir_sensor.py")
        print("STDOUT:")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        print("STDERR:")
        print(stderr.read().decode('utf-8', errors='replace').strip())
        
        # 4. Restart background scanner
        print("Restarting background scanner service on the Pi...")
        bg_cmd = "nohup python3 -u /home/palmpay/biopay_scanner.py > /tmp/biopay_scanner.log 2>&1 &"
        ssh.exec_command(bg_cmd)
        time.sleep(1)
        
        ssh.close()
        print("Done!")
    except Exception as e:
        print("SSH/SFTP error:", e)

if __name__ == "__main__":
    upload_and_run_ir_test()
