import paramiko
import time
import sys

def restart_scanner():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    oled_driver = "ssd1306"

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=username, password=password, timeout=15)

    # 1. Kill any existing scanner
    print("Stopping any existing scanner processes...")
    ssh.exec_command("pkill -f biopay_scanner.py")
    time.sleep(2)

    # 2. Verify the uploaded script has multi-scan logic
    print("Checking uploaded script for multi-scan logic...")
    _, out, _ = ssh.exec_command("grep -c 'multi-scan' /home/palmpay/biopay_scanner.py")
    count = out.read().decode().strip()
    print(f"  'multi-scan' keyword found {count} time(s) in uploaded script")

    # 3. Clear old log
    ssh.exec_command("echo '' > /tmp/biopay_scanner.log")

    # 4. Start scanner in background with OLED_DRIVER env var
    print(f"Starting BioPay scanner (OLED_DRIVER={oled_driver})...")
    bg_cmd = f"nohup env OLED_DRIVER={oled_driver} python3 -u /home/palmpay/biopay_scanner.py > /tmp/biopay_scanner.log 2>&1 &"
    ssh.exec_command(bg_cmd)
    time.sleep(4)

    # 5. Check startup logs
    print("Checking scanner startup logs...")
    _, out, _ = ssh.exec_command("cat /tmp/biopay_scanner.log")
    log_out = out.read().decode('utf-8', errors='replace').strip()
    print("\n--- Scanner Startup Log ---")
    sys.stdout.buffer.write(log_out.encode('ascii', errors='backslashreplace'))
    print("\n---------------------------\n")

    # 6. Verify process is running
    _, out, _ = ssh.exec_command("pgrep -a -f biopay_scanner.py")
    procs = out.read().decode().strip()
    if procs:
        print(f"Scanner process(es) running:\n{procs}")
    else:
        print("WARNING: No scanner process found!")

    ssh.close()
    print("Done!")

if __name__ == "__main__":
    restart_scanner()
