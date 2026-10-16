import type { PricePoint } from './types';

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/**
 * Typical intraday price pattern in Germany (EUR deviation from the daily mean, per local hour).
 * Derived from the publicly reported pattern of the Bundeskartellamt / ADAC analyses:
 * expensive in the early morning (peak ~7:00), cheapest in the evening (~18–22 h),
 * followed by a jump at around 22:00. Used whenever we do not have enough own history.
 */
const RAW_DE_PROFILE = [
  3, 3, 3, 3.5, 4, 5, 7, 8, 6, 4, 2.5, 1, 2, 0.5, -1, 0, -2, -3, -5, -6.5, -5.5, -6.5, 1, 2.5,
];
const rawMean = RAW_DE_PROFILE.reduce((a, b) => a + b, 0) / 24;
export const DEFAULT_PROFILE: number[] = RAW_DE_PROFILE.map((c) => (c - rawMean) / 100);

export interface HourProfile {
  /** EUR deviation from the daily mean per hour 0..23. */
  deltas: number[];
  /** Number of days the profile is based on (0 = built-in estimate). */
  days: number;
}

export const DEFAULT_HOUR_PROFILE: HourProfile = { deltas: DEFAULT_PROFILE, days: 0 };

export function sortPoints(points: PricePoint[]): PricePoint[] {
  return [...points].sort((a, b) => a.t - b.t);
}

/** Price valid at time t (step function). Points must be sorted ascending. */
export function valueAt(points: PricePoint[], t: number): number | null {
  let lo = 0;
  let hi = points.length - 1;
  if (hi < 0 || points[0].t > t) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  return points[lo].p;
}

/** Merge two point lists, dropping consecutive duplicates. */
export function mergePoints(a: PricePoint[], b: PricePoint[]): PricePoint[] {
  const all = sortPoints([...a, ...b]);
  const out: PricePoint[] = [];
  for (const pt of all) {
    const last = out[out.length - 1];
    if (last && last.t === pt.t) {
      last.p = pt.p;
      continue;
    }
    if (last && Math.abs(last.p - pt.p) < 1e-6) continue;
    out.push({ ...pt });
  }
  return out;
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Learn the hour-of-day pattern from a step-function history. */
export function hourlyProfile(points: PricePoint[], now: number, maxDays = 28, minDays = 3): HourProfile | null {
  const pts = sortPoints(points);
  if (pts.length < 4) return null;
  const sums = new Array(24).fill(0);
  let days = 0;
  const today = startOfDay(now);
  for (let d = 1; d <= maxDays; d++) {
    const day = today - d * DAY;
    // The day must be fully covered by the history.
    if (pts[0].t > day) continue;
    const vals: number[] = [];
    for (let h = 0; h < 24; h++) {
      const v = valueAt(pts, day + h * HOUR + HOUR / 2);
      if (v == null) break;
      vals.push(v);
    }
    if (vals.length < 24) continue;
    const m = vals.reduce((a, b) => a + b, 0) / 24;
    for (let h = 0; h < 24; h++) sums[h] += vals[h] - m;
    days++;
  }
  if (days < minDays) return null;
  return { deltas: sums.map((s) => s / days), days };
}

/** Average several profiles (e.g. of all stations in an area), weighted by their day counts. */
export function combineProfiles(profiles: HourProfile[]): HourProfile | null {
  const valid = profiles.filter((p) => p.days > 0);
  if (!valid.length) return null;
  const total = valid.reduce((a, p) => a + p.days, 0);
  const deltas = new Array(24).fill(0);
  for (const p of valid) for (let h = 0; h < 24; h++) deltas[h] += (p.deltas[h] * p.days) / total;
  return { deltas, days: Math.round(total / valid.length) };
}

/** Predict the price at `target` based on the current price and an hour profile. */
export function predictPrice(current: number, now: number, target: number, profile: HourProfile = DEFAULT_HOUR_PROFILE): number {
  const hNow = new Date(now).getHours();
  const hT = new Date(target).getHours();
  return current - profile.deltas[hNow] + profile.deltas[hT];
}

export interface HourHint {
  hour: number;
  delta: number;
}

/** Hours sorted from cheapest to most expensive. */
export function rankHours(profile: HourProfile): HourHint[] {
  return profile.deltas.map((delta, hour) => ({ hour, delta })).sort((a, b) => a.delta - b.delta);
}

/**
 * Within the next `horizonH` hours: when is the cheapest moment, and how much cheaper is it than now?
 */
export function nextCheapWindow(now: number, profile: HourProfile, horizonH = 24): { at: number; saving: number } {
  const hNow = new Date(now).getHours();
  let best = { at: now, saving: 0 };
  for (let i = 1; i <= horizonH; i++) {
    const t = now + i * HOUR;
    const start = new Date(t);
    start.setMinutes(0, 0, 0);
    const saving = profile.deltas[hNow] - profile.deltas[start.getHours()];
    if (saving > best.saving + 0.002) best = { at: start.getTime(), saving };
  }
  return best;
}

export interface DayAgg {
  day: number;
  min: number;
  max: number;
  avg: number;
}

/** Per-day min / max / time-weighted average of a step function. */
export function dailyAggregates(points: PricePoint[], from: number, to: number): DayAgg[] {
  const pts = sortPoints(points);
  const out: DayAgg[] = [];
  for (let day = startOfDay(from); day < to; day += DAY) {
    const end = Math.min(day + DAY, to);
    const start = Math.max(day, from);
    let v = valueAt(pts, start);
    let cursor = start;
    let min = v ?? Infinity;
    let max = v ?? -Infinity;
    let weighted = 0;
    let covered = 0;
    for (const pt of pts) {
      if (pt.t <= start) continue;
      if (pt.t >= end) break;
      if (v != null) {
        weighted += v * (pt.t - cursor);
        covered += pt.t - cursor;
      }
      v = pt.p;
      cursor = pt.t;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    if (v != null) {
      weighted += v * (end - cursor);
      covered += end - cursor;
    }
    if (covered > 0) out.push({ day, min, max, avg: weighted / covered });
  }
  return out;
}
