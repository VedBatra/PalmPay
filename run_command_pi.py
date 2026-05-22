import paramiko
import sys

def run_pi_cmd(cmd):
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(ip, username=username, password=password, timeout=15)
        stdin, stdout, stderr = ssh.exec_command(cmd)
        print(f"--- Command: {cmd} ---")
        
        out_bytes = stdout.read()
        err_bytes = stderr.read()
        
        out_str = out_bytes.decode('utf-8', errors='replace').strip()
        err_str = err_bytes.decode('utf-8', errors='replace').strip()
        
        print("STDOUT:")
        sys.stdout.buffer.write(out_str.encode('ascii', errors='backslashreplace'))
        print("\nSTDERR:")
        sys.stdout.buffer.write(err_str.encode('ascii', errors='backslashreplace'))
        print()
        
        ssh.close()
    except Exception as e:
        print(f"SSH Failed: {e}")

if __name__ == "__main__":
    cmd = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "tail -n 40 /tmp/biopay_scanner.log"
    run_pi_cmd(cmd)
