import paramiko

def run_pi_sudo_cmd(cmd):
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        # Test apt lock by doing a dry-run install
        stdin, stdout, stderr = ssh.exec_command(f"echo {password} | sudo -S {cmd}")
        print(f"--- Sudo Command: {cmd} ---")
        print("STDOUT:")
        print(stdout.read().decode().strip())
        print("STDERR:")
        print(stderr.read().decode().strip())
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    # Run a dry-run install to check if lock is free
    run_pi_sudo_cmd("apt-get -s install python3-opencv")
