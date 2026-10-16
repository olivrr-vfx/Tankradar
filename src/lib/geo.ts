import type { LatLng } from './types';

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distances (km) along a polyline given as [lng, lat] pairs (GeoJSON order). */
export function cumulativeKm(coords: [number, number][]): number[] {
  const out = new Array<number>(coords.length);
  let acc = 0;
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += haversineKm(
      { lng: coords[i - 1][0], lat: coords[i - 1][1] },
      { lng: coords[i][0], lat: coords[i][1] },
    );
    out[i] = acc;
  }
  return out;
}

/** Point at a given distance (km) along the polyline. */
export function pointAlong(coords: [number, number][], cum: number[], km: number): LatLng {
  if (km <= 0) return { lng: coords[0][0], lat: coords[0][1] };
  const total = cum[cum.length - 1];
  if (km >= total) return { lng: coords[coords.length - 1][0], lat: coords[coords.length - 1][1] };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= km) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const f = (km - cum[lo]) / seg;
  return {
    lng: coords[lo][0] + (coords[hi][0] - coords[lo][0]) * f,
    lat: coords[lo][1] + (coords[hi][1] - coords[lo][1]) * f,
  };
}

/** Evenly spaced sample points along the polyline, always including start and end. */
export function sampleAlong(coords: [number, number][], cum: number[], stepKm: number): LatLng[] {
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.ceil(total / stepKm));
  const pts: LatLng[] = [];
  for (let i = 0; i <= n; i++) pts.push(pointAlong(coords, cum, (total * i) / n));
  return pts;
}

export interface Projection {
  /** Distance along the route to the closest point (km). */
  alongKm: number;
  /** Perpendicular distance from the route (km). */
  offKm: number;
}

/**
 * Projects a point onto the polyline using a local equirectangular approximation per segment.
 * Good enough for corridors of a few kilometres.
 */
export function projectOnRoute(p: LatLng, coords: [number, number][], cum: number[]): Projection {
  let best: Projection = { alongKm: 0, offKm: Infinity };
  const kx = Math.cos(rad(p.lat)) * ((Math.PI * R) / 180);
  const ky = (Math.PI * R) / 180;
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1][0] - p.lng) * kx;
    const ay = (coords[i - 1][1] - p.lat) * ky;
    const bx = (coords[i][0] - p.lng) * kx;
    const by = (coords[i][1] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t;
    const cy = ay + dy * t;
    const d = Math.hypot(cx, cy);
    if (d < best.offKm) best = { alongKm: cum[i - 1] + (cum[i] - cum[i - 1]) * t, offKm: d };
  }
  return best;
}

/** Douglas–Peucker-free cheap simplification: keep points at least `minKm` apart. */
export function thinPolyline(coords: [number, number][], minKm: number): [number, number][] {
  if (coords.length < 3) return coords;
  const out: [number, number][] = [coords[0]];
  let last = coords[0];
  for (let i = 1; i < coords.length - 1; i++) {
    const c = coords[i];
    if (haversineKm({ lng: last[0], lat: last[1] }, { lng: c[0], lat: c[1] }) >= minKm) {
      out.push(c);
      last = c;
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

export function boundsOf(points: LatLng[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
