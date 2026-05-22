import paramiko
import time

def run_pi_bg_cmd(cmd):
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        print("Launching background install on Pi using Aliyun mirror...")
        ssh.exec_command(cmd)
        time.sleep(2)
        
        print("Checking log file `/tmp/pip_mirror.log`...")
        stdin, stdout, stderr = ssh.exec_command("cat /tmp/pip_mirror.log")
        print("Log output:")
        print(stdout.read().decode().strip())
        
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    # Launch in background, redirect output to /tmp/pip_mirror.log
    bg_command = "nohup pip3 install opencv-python-headless --break-system-packages -i https://mirrors.aliyun.com/pypi/simple > /tmp/pip_mirror.log 2>&1 &"
    run_pi_bg_cmd(bg_command)
