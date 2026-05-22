import paramiko
import time
import sys

def run_scanner():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    # Configure the OLED driver ("ssd1306" or "sh1106"). 
    # Change to "sh1106" if your display uses the SH1106 driver.
    oled_driver = "ssd1306"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        # Kill any existing biopay_scanner.py instances
        print("Stopping any existing scanner processes on the Pi...")
        ssh.exec_command("pkill -f biopay_scanner.py")
        time.sleep(1)
        
        # Start scanner in background with OLED_DRIVER env var
        print(f"Starting BioPay scanner on the Pi in the background (OLED_DRIVER={oled_driver})...")
        bg_cmd = f"nohup env OLED_DRIVER={oled_driver} python3 -u /home/palmpay/biopay_scanner.py > /tmp/biopay_scanner.log 2>&1 &"
        ssh.exec_command(bg_cmd)
        time.sleep(3)
        
        # Check logs
        print("Checking scanner initialization logs...")
        stdin, stdout, stderr = ssh.exec_command("cat /tmp/biopay_scanner.log")
        log_out = stdout.read().decode('utf-8', errors='replace').strip()
        print("\n--- /tmp/biopay_scanner.log ---")
        sys.stdout.buffer.write(log_out.encode('ascii', errors='backslashreplace'))
        print("\n-------------------------------\n")
        
        ssh.close()
    except Exception as e:
        print(f"Failed to run scanner: {e}")

if __name__ == "__main__":
    run_scanner()
