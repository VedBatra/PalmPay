export const BLACKLISTED_HASHES = new Set([
  "22d05d61a54173b13d57f9b57dd9723abf760b038925411e6b98a77bd514bec0", // 2592x1944
  "7818f5542a0404157573be6cffc0e0c8e68ce3c0f5d17d07ccdd9313fb700baf", // 640x480
  "11283ef755895422e6f28b93f3d78cad7539891cf2893c9fdccefb923c5bf70b", // 1920x1080
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"  // Empty
]);

export function isBlacklisted(hashString: string): boolean {
  if (!hashString) return true;
  const parts = hashString.split(",");
  for (const part of parts) {
    if (BLACKLISTED_HASHES.has(part.trim())) {
      return true;
    }
  }
  return false;
}

export function hexToBits(hex: string): boolean[] {
  const bits: boolean[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    for (let bit = 7; bit >= 0; bit--) {
      bits.push(((byte >> bit) & 1) === 1);
    }
  }
  return bits;
}

export function countActiveBits(hex: string): number {
  const bits = hexToBits(hex);
  return bits.filter(b => b).length;
}

export function computeJaccardSimilarity(hex1: string, hex2: string): number {
  const bits1 = hexToBits(hex1);
  const bits2 = hexToBits(hex2);

  // If they are not 32x32 templates (1024 bits = 256 hex chars), do standard Jaccard
  if (bits1.length !== 1024 || bits2.length !== 1024) {
    let match = 0;
    let union = 0;
    const length = Math.min(bits1.length, bits2.length);
    for (let i = 0; i < length; i++) {
      if (bits1[i] || bits2[i]) {
        union++;
        if (bits1[i] && bits2[i]) {
          match++;
        }
      }
    }
    if (union === 0) return 0;
    return match / union;
  }

  const active1 = bits1.filter(b => b).length;
  const active2 = bits2.filter(b => b).length;
  if (active1 < 15 || active2 < 15) {
    return 0; // Low quality templates should never match
  }

  // 2D grid translation shift optimization to align genuine templates
  let maxScore = 0;
  
  // We check translation shifts of grid1 in X (dx) and Y (dy) from -2 to 2 pixels
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      let match = 0;
      let union = 0;
      
      for (let r = 0; r < 32; r++) {
        const srcR = r - dy;
        const inBoundsY = srcR >= 0 && srcR < 32;
        
        for (let c = 0; c < 32; c++) {
          const srcC = c - dx;
          const inBoundsX = srcC >= 0 && srcC < 32;
          
          const idx2 = r * 32 + c;
          const val2 = bits2[idx2];
          
          // Shifted grid1 bit
          const val1 = (inBoundsY && inBoundsX) ? bits1[srcR * 32 + srcC] : false;
          
          if (val1 || val2) {
            union++;
            if (val1 && val2) {
              match++;
            }
          }
        }
      }
      
      if (union > 0) {
        const score = match / union;
        if (score > maxScore) {
          maxScore = score;
        }
      }
    }
  }
  
  return maxScore;
}

