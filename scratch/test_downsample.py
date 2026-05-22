import cv2
import numpy as np
import hashlib

def extract_biometric_hex_template(image_path):
    # Load image
    img = cv2.imread(image_path)
    if img is None:
        print(f"Could not load image: {image_path}")
        return None
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply enhancement (same as scanner)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Downsample to 32x32
    resized = cv2.resize(edges, (32, 32), interpolation=cv2.INTER_AREA)
    _, binary_edges = cv2.threshold(resized, 1, 255, cv2.THRESH_BINARY)
    
    # Flatten to 1024 bits
    flat = (binary_edges > 0).astype(int).flatten()
    
    # Pack bits into bytes
    packed_bytes = bytearray()
    for i in range(0, len(flat), 8):
        byte_val = 0
        for bit in range(8):
            if flat[i + bit]:
                byte_val |= (1 << (7 - bit))
        packed_bytes.append(byte_val)
        
    return packed_bytes.hex(), np.count_nonzero(flat)

def compute_jaccard_similarity(hex1, hex2):
    # Convert hex back to binary array
    bytes1 = bytes.fromhex(hex1)
    bytes2 = bytes.fromhex(hex2)
    
    bits1 = []
    bits2 = []
    for b in bytes1:
        for bit in range(7, -1, -1):
            bits1.append((b >> bit) & 1)
    for b in bytes2:
        for bit in range(7, -1, -1):
            bits2.append((b >> bit) & 1)
            
    bits1 = np.array(bits1)
    bits2 = np.array(bits2)
    
    match = np.sum((bits1 == 1) & (bits2 == 1))
    union = np.sum((bits1 == 1) | (bits2 == 1))
    
    if union == 0:
        return 0.0
    return float(match) / union

def main():
    res1 = extract_biometric_hex_template("artifacts/test_raw.jpg")
    res2 = extract_biometric_hex_template("artifacts/test_enhanced.jpg")
    
    if res1 and res2:
        hex1, count1 = res1
        hex2, count2 = res2
        print(f"Image 1 Hex Length: {len(hex1)}, Active bits: {count1}/1024")
        print(f"Image 2 Hex Length: {len(hex2)}, Active bits: {count2}/1024")
        
        sim = compute_jaccard_similarity(hex1, hex2)
        print(f"Jaccard Similarity between two test images: {sim:.4f}")
        
        # Self similarity
        print(f"Self-similarity 1: {compute_jaccard_similarity(hex1, hex1):.4f}")
        print(f"Self-similarity 2: {compute_jaccard_similarity(hex2, hex2):.4f}")

if __name__ == "__main__":
    main()
