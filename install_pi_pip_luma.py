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
        
        print("Launching background install on Pi for luma.oled using Aliyun mirror...")
        ssh.exec_command(cmd)
        time.sleep(2)
        
        print("Checking log file `/tmp/pip_luma.log`...")
        stdin, stdout, stderr = ssh.exec_command("cat /tmp/pip_luma.log")
        print("Log output:")
        print(stdout.read().decode('utf-8', errors='replace').strip())
        
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    bg_command = "nohup pip3 install luma.oled --break-system-packages -i https://mirrors.aliyun.com/pypi/simple > /tmp/pip_luma.log 2>&1 &"
    run_pi_bg_cmd(bg_command)
