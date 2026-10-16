import { cumulativeKm } from '../lib/geo';
import type { LatLng } from '../lib/types';
import { getJson } from './http';

export interface Route {
  coords: [number, number][];
  cumKm: number[];
  /** Seconds from start for every coordinate. */
  cumSec: number[];
  distanceKm: number;
  durationSec: number;
}

interface OsrmResponse {
  code: string;
  message?: string;
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: { annotation?: { duration: number[] } }[];
  }[];
}

export const DEFAULT_ROUTERS = ['https://routing.openstreetmap.de/routed-car', 'https://router.project-osrm.org'];

export async function fetchRoute(points: LatLng[], routerBase?: string): Promise<Route> {
  const bases = routerBase ? [routerBase, ...DEFAULT_ROUTERS] : DEFAULT_ROUTERS;
  const path = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  let lastErr: unknown = null;
  for (const base of [...new Set(bases)]) {
    try {
      const res = await getJson<OsrmResponse>(
        `${base.replace(/\/+$/, '')}/route/v1/driving/${path}?overview=full&geometries=geojson&annotations=duration&steps=false`,
        { timeoutMs: 20000 },
      );
      if (res.code !== 'Ok' || !res.routes.length) throw new Error(res.message || res.code);
      return toRoute(res.routes[0]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Routing fehlgeschlagen');
}

function toRoute(r: OsrmResponse['routes'][number]): Route {
  const coords = r.geometry.coordinates;
  const cumKm = cumulativeKm(coords);
  const segDur = r.legs.flatMap((l) => l.annotation?.duration ?? []);
  const cumSec = new Array<number>(coords.length).fill(0);
  if (segDur.length === coords.length - 1) {
    for (let i = 1; i < coords.length; i++) cumSec[i] = cumSec[i - 1] + segDur[i - 1];
  } else {
    const total = cumKm[cumKm.length - 1] || 1;
    for (let i = 0; i < coords.length; i++) cumSec[i] = (cumKm[i] / total) * r.duration;
  }
  return { coords, cumKm, cumSec, distanceKm: r.distance / 1000, durationSec: r.duration };
}

/** Driving time (s) from the start to a point `km` along the route. */
export function secondsAt(route: Route, km: number): number {
  const { cumKm, cumSec } = route;
  if (km <= 0) return 0;
  if (km >= cumKm[cumKm.length - 1]) return cumSec[cumSec.length - 1];
  let lo = 0;
  let hi = cumKm.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumKm[mid] <= km) lo = mid;
    else hi = mid;
  }
  const f = (km - cumKm[lo]) / (cumKm[hi] - cumKm[lo] || 1);
  return cumSec[lo] + (cumSec[hi] - cumSec[lo]) * f;
}

/** Straight-line fallback "route" used by the demo when routing servers are unreachable. */
export function straightRoute(a: LatLng, b: LatLng, kmh = 95): Route {
  const n = 60;
  const coords: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    // a gentle curve so it does not look like a ruler line
    const bend = Math.sin(f * Math.PI) * 0.04;
    coords.push([a.lng + (b.lng - a.lng) * f + bend * (b.lat - a.lat), a.lat + (b.lat - a.lat) * f - bend * (b.lng - a.lng)]);
  }
  const cumKm = cumulativeKm(coords).map((k) => k * 1.15);
  const total = cumKm[cumKm.length - 1];
  const durationSec = (total / kmh) * 3600;
  return { coords, cumKm, cumSec: cumKm.map((k) => (k / total) * durationSec), distanceKm: total, durationSec };
}
