import paramiko

def run_pi_cmd(cmd):
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(f"--- Command: {cmd} ---")
        print("STDOUT:")
        print(stdout.read().decode().strip())
        print("STDERR:")
        print(stderr.read().decode().strip())
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    run_pi_cmd("pip3 install opencv-python-headless --break-system-packages")
