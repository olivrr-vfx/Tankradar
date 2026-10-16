/** Small deterministic PRNG helpers (used by the demo data source). */
export function hashString(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngFor = (key: string) => mulberry32(hashString(key));

/** Smooth 2D value noise in [0,1]. */
export function valueNoise(x: number, y: number, seed = 'n'): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const r = (i: number, j: number) => rngFor(`${seed}:${i}:${j}`)();
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = r(xi, yi);
  const b = r(xi + 1, yi);
  const c = r(xi, yi + 1);
  const d = r(xi + 1, yi + 1);
  const u = s(xf);
  const v = s(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
