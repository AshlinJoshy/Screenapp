/**
 * Compute aspect ratio string (e.g. "16:9") from pixel dimensions.
 */
export function computeAspectRatio(w: number, h: number): string {
  const gcd = greatestCommonDivisor(w, h);
  return `${w / gcd}:${h / gcd}`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}
