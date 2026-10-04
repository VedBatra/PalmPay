import paramiko
import time

def upload_and_run_diag():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    pi_script = """
import time
import sys
from luma.core.interface.serial import i2c
from luma.core.render import canvas

def try_device(device_type):
    print(f"Trying OLED device: {device_type} on address 0x3C...")
    try:
        serial = i2c(port=1, address=0x3C)
        if device_type == "ssd1306":
            from luma.oled.device import ssd1306
            device = ssd1306(serial)
        elif device_type == "sh1106":
            from luma.oled.device import sh1106
            device = sh1106(serial)
        else:
            print("Unknown device type")
            return False
            
        print(f"Driver {device_type} initialized. Drawing test screen...")
        device.contrast(255) # Max contrast
        with canvas(device) as draw:
            # Draw border
            draw.rectangle((0, 0, device.width - 1, device.height - 1), outline="white")
            # Draw diagonal lines
            draw.line((0, 0, device.width - 1, device.height - 1), fill="white")
            draw.line((0, device.height - 1, device.width - 1, 0), fill="white")
            # Draw central text block
            draw.rectangle((10, 10, device.width - 11, device.height - 11), fill="black", outline="white")
            draw.text((30, 25), f"TEST: {device_type.upper()}", fill="white")
            
        print("Draw command sent! Please check if the screen lit up.")
        time.sleep(5)
        return True
    except Exception as e:
        print(f"Error with {device_type}: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try_device(sys.argv[1])
    else:
        try_device("ssd1306")
        print("Waiting 3 seconds before next driver test...")
        time.sleep(3)
        try_device("sh1106")
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
        print("Writing diagnose_oled.py to Pi...")
        sftp = ssh.open_sftp()
        with sftp.file("/home/palmpay/diagnose_oled.py", "w") as f:
            f.write(pi_script)
        sftp.close()
        
        # 3. Run script on Pi
        print("Running diagnose_oled.py on Pi...")
        stdin, stdout, stderr = ssh.exec_command("python3 /home/palmpay/diagnose_oled.py")
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
    upload_and_run_diag()
