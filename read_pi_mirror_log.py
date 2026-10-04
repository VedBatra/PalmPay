import paramiko
import sys

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
        
        # Read and decode safely as UTF-8
        out_bytes = stdout.read()
        err_bytes = stderr.read()
        
        out_str = out_bytes.decode('utf-8', errors='replace').strip()
        err_str = err_bytes.decode('utf-8', errors='replace').strip()
        
        # Print with cp850 or ascii safe encoding on Windows console
        print("STDOUT:")
        sys.stdout.buffer.write(out_str.encode('ascii', errors='replace'))
        print("\nSTDERR:")
        sys.stdout.buffer.write(err_str.encode('ascii', errors='replace'))
        print()
        
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    run_pi_cmd("tail -n 30 /tmp/pip_mirror.log")
