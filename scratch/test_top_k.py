import paramiko
import sys

def run_top_k_test():
    ip = "10.250.112.108"
    username = "palmpay"
    password = "palm123"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(ip, username=username, password=password, timeout=15)
    
    pi_code = """
import cv2
import numpy as np

img = cv2.imread('/tmp/test_raw.jpg')
if img is None:
    print("Error: /tmp/test_raw.jpg not found.")
    exit(1)

# Get Grayscale and Canny
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
enhanced = clahe.apply(gray)
blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

def extract_top_k_template(edge_map, k_percent=15):
    resized = cv2.resize(edge_map, (32, 32), interpolation=cv2.INTER_AREA)
    flat_resized = resized.flatten()
    
    # Sort indices
    sorted_indices = np.argsort(flat_resized)
    num_ones = int(1024 * (k_percent / 100.0))
    
    flat = np.zeros(1024, dtype=int)
    top_indices = sorted_indices[-num_ones:]
    for idx in top_indices:
        if flat_resized[idx] > 0:
            flat[idx] = 1
    return flat

# 1. Template for original image
tmpl_orig = extract_top_k_template(edges, 15)
print(f"Original template active cells: {np.sum(tmpl_orig)}")

# 2. Simulate physical hand shift (translate by 20 pixels X, 20 pixels Y)
rows, cols = edges.shape
M = np.float32([[1, 0, 20], [0, 1, 20]])
edges_shifted = cv2.warpAffine(edges, M, (cols, rows))
tmpl_shifted = extract_top_k_template(edges_shifted, 15)
print(f"Shifted template active cells: {np.sum(tmpl_shifted)}")

# 3. Simulate hand rotation (rotate by 3 degrees)
M_rot = cv2.getRotationMatrix2D((cols/2, rows/2), 3, 1)
edges_rotated = cv2.warpAffine(edges, M_rot, (cols, rows))
tmpl_rotated = extract_top_k_template(edges_rotated, 15)
print(f"Rotated template active cells: {np.sum(tmpl_rotated)}")

# 4. Generate a different mock palm/random template
np.random.seed(42)
tmpl_random = np.zeros(1024, dtype=int)
tmpl_random[np.random.choice(1024, 153, replace=False)] = 1

# Calculate Jaccard Similarities
def jaccard(a, b):
    intersection = np.sum((a == 1) & (b == 1))
    union = np.sum((a == 1) | (b == 1))
    if union == 0: return 0
    return intersection / union

score_self = jaccard(tmpl_orig, tmpl_orig)
score_shift = jaccard(tmpl_orig, tmpl_shifted)
score_rot = jaccard(tmpl_orig, tmpl_rotated)
score_diff = jaccard(tmpl_orig, tmpl_random)

print("\\n--- Jaccard Similarity Scores ---")
print(f"Same Hand (Exact match):       {score_self:.4f}")
print(f"Same Hand (Shifted 20px):      {score_shift:.4f}  (Expected: > 0.25)")
print(f"Same Hand (Rotated 3 degrees): {score_rot:.4f}  (Expected: > 0.25)")
print(f"Different Hand (Random):       {score_diff:.4f}  (Expected: < 0.15)")
"""
    
    sftp = ssh.open_sftp()
    with sftp.file('/tmp/test_top_k.py', 'w') as f:
        f.write(pi_code)
    sftp.close()
    
    stdin, stdout, stderr = ssh.exec_command("python3 /tmp/test_top_k.py")
    print("STDOUT:")
    print(stdout.read().decode())
    print("STDERR:")
    print(stderr.read().decode())
    ssh.close()

if __name__ == "__main__":
    run_top_k_test()
