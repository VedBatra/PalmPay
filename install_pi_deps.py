import paramiko

def run_pi_sudo_cmd(cmd):
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=10)
        
        # Use invoke_shell or sudo -S to pass the password to sudo
        stdin, stdout, stderr = ssh.exec_command(f"echo {password} | sudo -S {cmd}")
        print(f"--- Sudo Command: {cmd} ---")
        print("STDOUT:")
        # We read the output in chunks to avoid blocking
        print(stdout.read().decode().strip())
        print("STDERR:")
        print(stderr.read().decode().strip())
        ssh.close()
    except Exception as e:
        print(f"SSH/Sudo Failed: {e}")

if __name__ == "__main__":
    run_pi_sudo_cmd("apt-get update && apt-get install -y python3-opencv")
