export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs: number[]) => quantile(xs, 0.5);

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

export interface Summary {
  n: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
}

export function summarize(xs: number[]): Summary | null {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0);
  if (!v.length) return null;
  return {
    n: v.length,
    mean: mean(v),
    median: median(v),
    min: Math.min(...v),
    max: Math.max(...v),
    p25: quantile(v, 0.25),
    p75: quantile(v, 0.75),
  };
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** Histogram with fixed bin width (e.g. 0.02 €). */
export function histogram(xs: number[], width: number): Bin[] {
  const v = xs.filter((x) => Number.isFinite(x));
  if (!v.length) return [];
  const start = Math.floor(Math.min(...v) / width) * width;
  const end = Math.max(...v);
  const n = Math.max(1, Math.floor((end - start) / width + 1e-9) + 1);
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    from: start + i * width,
    to: start + (i + 1) * width,
    count: 0,
  }));
  for (const x of v) bins[Math.min(n - 1, Math.floor((x - start) / width + 1e-9))].count++;
  return bins;
}

export type PriceLevel = 'cheap' | 'mid' | 'expensive';

/** Classify a price against the area distribution (terciles with a minimum spread). */
export function priceLevel(p: number, s: Summary | null): PriceLevel {
  if (!s || !Number.isFinite(p)) return 'mid';
  const lo = Math.min(s.p25, s.median - 0.01);
  const hi = Math.max(s.p75, s.median + 0.01);
  if (p <= lo) return 'cheap';
  if (p >= hi) return 'expensive';
  return 'mid';
}
