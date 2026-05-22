import paramiko
import os

def upload_file():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    local_file = r"c:\Users\Ved\OneDrive\Desktop\Bio-Pay-Access\Bio-Pay-Access\biopay_scanner.py"
    remote_file = "/home/palmpay/biopay_scanner.py"
    
    print(f"Connecting to {username}@{ip} via SFTP...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        sftp = ssh.open_sftp()
        print(f"Uploading {local_file} to {remote_file}...")
        sftp.put(local_file, remote_file)
        sftp.close()
        print("Upload completed successfully!")
        
        print("Checking remote file content...")
        stdin, stdout, stderr = ssh.exec_command("ls -la /home/palmpay/biopay_scanner.py")
        print("Remote file details:", stdout.read().decode().strip())
        
        ssh.close()
    except Exception as e:
        print(f"Failed to upload: {e}")

if __name__ == "__main__":
    upload_file()
