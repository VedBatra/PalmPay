import paramiko
import os

def upload_and_install():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    wheel_filename = "opencv_python_headless-4.13.0.92-cp37-abi3-manylinux_2_28_aarch64.whl"
    local_file = os.path.join(r"c:\Users\Ved\OneDrive\Desktop\Bio-Pay-Access\Bio-Pay-Access", wheel_filename)
    remote_file = f"/home/palmpay/{wheel_filename}"
    
    print(f"Connecting to {username}@{ip} via SFTP...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=15)
        sftp = ssh.open_sftp()
        print(f"Uploading {wheel_filename} to {remote_file}...")
        sftp.put(local_file, remote_file)
        sftp.close()
        print("Upload completed successfully!")
        
        print("Installing local wheel file on the Pi...")
        stdin, stdout, stderr = ssh.exec_command(f"pip3 install {remote_file} --break-system-packages")
        print("STDOUT:")
        print(stdout.read().decode().strip())
        print("STDERR:")
        print(stderr.read().decode().strip())
        
        print("\nVerifying cv2 import on Pi...")
        stdin, stdout, stderr = ssh.exec_command("python3 -c \"import cv2; print('cv2 version:', cv2.__version__)\"")
        print("STDOUT:")
        print(stdout.read().decode().strip())
        print("STDERR:")
        print(stderr.read().decode().strip())
        
        ssh.close()
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    upload_and_install()
