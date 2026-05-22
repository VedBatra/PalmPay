import paramiko

def test_ssh(username, password):
    ip = "10.250.112.108"
    print(f"Connecting to {username}@{ip} with password...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=5)
        print(f"SUCCESS: Connected as {username}!")
        stdin, stdout, stderr = ssh.exec_command("whoami && uname -a")
        print("Output:", stdout.read().decode().strip())
        ssh.close()
        return True
    except Exception as e:
        print(f"FAILED for {username}: {e}")
        return False

test_ssh("palmpay", "palm123")
