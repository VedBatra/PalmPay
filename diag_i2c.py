import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect("10.250.112.108", username="palmpay", password="palm123", timeout=10)

for bus in [0, 1, 2, 10, 11]:
    print(f"\n=== I2C Bus {bus} ===")
    _, out, err = ssh.exec_command(f"echo palm123 | sudo -S i2cdetect -y {bus} 2>/dev/null")
    stdout_text = out.read().decode("utf-8", errors="replace").strip()
    stderr_text = err.read().decode("utf-8", errors="replace").strip()
    if stdout_text:
        print(stdout_text)
    elif stderr_text:
        print(f"Error: {stderr_text}")
    else:
        print("(no output)")

# Also check GPIO status and wiring
print("\n=== GPIO pin states ===")
_, out, _ = ssh.exec_command("echo palm123 | sudo -S cat /sys/kernel/debug/gpio 2>/dev/null | head -40")
print(out.read().decode("utf-8", errors="replace").strip())

# Check if the OLED was ever detected  
print("\n=== Recent kernel messages about I2C ===")
_, out, _ = ssh.exec_command("echo palm123 | sudo -S dmesg 2>/dev/null | grep -iE 'i2c|oled|ssd1306|sh1106' | tail -10")
print(out.read().decode("utf-8", errors="replace").strip())

ssh.close()
print("\nDiagnostics complete.")
