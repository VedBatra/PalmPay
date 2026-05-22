import paramiko
import sys

def upload_and_run_analysis():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=username, password=password, timeout=15)
    
    # Python code to run on Pi
    pi_code = """
import cv2
import numpy as np

img = cv2.imread('/tmp/test_raw.jpg')
if img is None:
    print("Error: /tmp/test_raw.jpg not found!")
    exit(1)

gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
enhanced = clahe.apply(gray)
blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

print(f"Image dimensions: {img.shape}")
print(f"Total edge pixels in Canny: {cv2.countNonZero(edges)}")

resized = cv2.resize(edges, (32, 32), interpolation=cv2.INTER_AREA)

for thresh in [1, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 128]:
    _, binary_edges = cv2.threshold(resized, thresh, 255, cv2.THRESH_BINARY)
    active_cells = cv2.countNonZero(binary_edges)
    density_pct = (active_cells / 1024.0) * 100.0
    print(f"Threshold: {thresh:3d} | Active Cells (Ones): {active_cells:4d} / 1024 | Density: {density_pct:5.2f}%")
"""
    
    # Write python code to /tmp/analyze_pi_density.py
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/analyze_pi_density.py', 'w') as f:
        f.write(pi_code)
    sftp.close()
    
    # Run the script on the Pi
    stdin, stdout, stderr = ssh.exec_command("python3 /tmp/analyze_pi_density.py")
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    
    print("STDOUT:")
    print(out)
    print("STDERR:")
    print(err)
    
    ssh.close()

if __name__ == "__main__":
    upload_and_run_analysis()
