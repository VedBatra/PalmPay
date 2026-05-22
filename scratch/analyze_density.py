import cv2
import numpy as np

# Load a test image if available, else create a mock structured palm edge map for analysis
try:
    img = cv2.imread("artifacts/test_raw.jpg")
    if img is None:
        raise ValueError("Image not found")
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
except Exception as e:
    print(f"Test image not found, generating mock palm structures... ({e})")
    gray = np.zeros((1944, 2592), dtype=np.uint8)
    # Draw some mock palm lines
    cv2.line(gray, (500, 300), (2000, 1600), 200, 10)
    cv2.line(gray, (300, 1200), (2200, 600), 180, 8)
    cv2.line(gray, (800, 1800), (1800, 200), 150, 12)
    # Add noise to simulate real-world physical captures
    noise = np.random.normal(0, 15, gray.shape).astype(np.uint8)
    gray = cv2.add(gray, noise)

# 1. Standard Preprocessing
clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
enhanced = clahe.apply(gray)
blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
edges = cv2.Canny(blurred, 50, 150)

print(f"Original edges shape: {edges.shape}")
print(f"Total edge pixels: {cv2.countNonZero(edges)}")

# Downsample using cv2.INTER_AREA
resized = cv2.resize(edges, (32, 32), interpolation=cv2.INTER_AREA)

# Print density for various thresholds
for thresh in [1, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100]:
    _, binary_edges = cv2.threshold(resized, thresh, 255, cv2.THRESH_BINARY)
    active_cells = cv2.countNonZero(binary_edges)
    density_pct = (active_cells / 1024.0) * 100.0
    print(f"Threshold: {thresh:3d} | Active Cells (Ones): {active_cells:4d} / 1024 | Density: {density_pct:5.2f}%")
