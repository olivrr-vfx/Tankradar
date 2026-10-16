import { projectOnRoute, sampleAlong, thinPolyline } from '../lib/geo';
import { combineProfiles, DAY, DEFAULT_HOUR_PROFILE, HOUR, hourlyProfile, predictPrice, type HourProfile } from '../lib/history';
import { planRefuel, type PlanCandidate, type PlanResult } from '../lib/planner';
import { median } from '../lib/stats';
import type { FuelType, LatLng, Provider, Station, Vehicle } from '../lib/types';
import { pool } from './http';
import { loadHistory, recordStations } from './historyStore';
import { fetchRoute, secondsAt, straightRoute, type Route } from './routing';

export interface TripInput {
  from: LatLng;
  to: LatLng;
  departure: number;
  vehicle: Vehicle;
  fuel: FuelType;
  startFuelL: number;
  reserveL: number;
  endFuelL: number;
  corridorKm: number;
  stopPenalty: number;
  routerUrl?: string;
}

export interface RouteStation {
  station: Station;
  alongKm: number;
  offKm: number;
  detourKm: number;
  etaOffsetSec: number;
  currentPrice: number;
}

export interface DepartureOption {
  departure: number;
  objective: number;
  feasible: boolean;
}

export interface TripResult {
  input: TripInput;
  route: Route;
  fallbackRoute: boolean;
  stations: RouteStation[];
  profile: HourProfile;
  plan: PlanResult<RouteStation>;
  refPrice: number;
  departures: DepartureOption[];
}

const ROAD_FACTOR = 1.3;

export async function findStationsAlong(provider: Provider, route: Route, corridorKm: number, onProgress?: (done: number, total: number) => void): Promise<RouteStation[]> {
  const thin = thinPolyline(route.coords, 0.15);
  const thinCum = (() => {
    // recompute cumulative km on the thinned line, scaled to the real route length
    const raw = thin.map(() => 0);
    for (let i = 1; i < thin.length; i++) {
      const [a, b] = [thin[i - 1], thin[i]];
      const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180) * 111.32;
      const dy = (b[1] - a[1]) * 110.57;
      raw[i] = raw[i - 1] + Math.hypot(dx, dy);
    }
    const scale = route.distanceKm / (raw[raw.length - 1] || 1);
    return raw.map((r) => r * scale);
  })();

  const maxQueries = 60;
  let queryRad = Math.min(provider.maxRadiusKm, corridorKm + 5);
  let step = 2 * Math.sqrt(Math.max(1, queryRad ** 2 - corridorKm ** 2)) * 0.9;
  if (route.distanceKm / step > maxQueries) {
    queryRad = provider.maxRadiusKm;
    step = Math.max(step, 2 * Math.sqrt(Math.max(1, queryRad ** 2 - corridorKm ** 2)) * 0.9, route.distanceKm / maxQueries);
  }
  const samples = sampleAlong(thin, thinCum, step);
  const found = new Map<string, Station>();
  let done = 0;
  await pool(samples, 3, async (pt) => {
    try {
      const list = await provider.search(pt, queryRad);
      for (const s of list) if (!found.has(s.id)) found.set(s.id, s);
    } catch {
      /* skip a failed sample */
    }
    onProgress?.(++done, samples.length);
  });
  void recordStations([...found.values()]);

  const out: RouteStation[] = [];
  for (const s of found.values()) {
    const proj = projectOnRoute(s, thin, thinCum);
    if (proj.offKm > corridorKm) continue;
    out.push({
      station: s,
      alongKm: proj.alongKm,
      offKm: proj.offKm,
      detourKm: Math.max(0.2, 2 * proj.offKm * ROAD_FACTOR),
      etaOffsetSec: secondsAt(route, proj.alongKm),
      currentPrice: NaN,
    });
  }
  return out.sort((a, b) => a.alongKm - b.alongKm);
}

async function routeProfile(provider: Provider, stations: RouteStation[], fuel: FuelType): Promise<HourProfile> {
  if (!provider.history) return DEFAULT_HOUR_PROFILE;
  const now = Date.now();
  const sample = stations.filter((s) => s.station.prices[fuel] != null);
  const picks = Array.from({ length: Math.min(8, sample.length) }, (_, i) => sample[Math.floor((i * sample.length) / Math.min(8, sample.length))]);
  const hs = await Promise.all(picks.map((s) => loadHistory(provider, s.station.id, fuel, now - 15 * DAY, now).catch(() => [])));
  const profiles = hs.map((h) => hourlyProfile(h, now, 14)).filter((p): p is HourProfile => !!p);
  return (profiles.length >= 2 && combineProfiles(profiles)) || DEFAULT_HOUR_PROFILE;
}

/** Keep only the most attractive stations per 10-km bucket to keep the optimisation fast. */
function prune(cands: PlanCandidate<RouteStation>[], perBucket: number, lpk: number): PlanCandidate<RouteStation>[] {
  const buckets = new Map<number, PlanCandidate<RouteStation>[]>();
  for (const c of cands) {
    const b = Math.floor(c.alongKm / 10);
    buckets.set(b, [...(buckets.get(b) ?? []), c]);
  }
  const out: PlanCandidate<RouteStation>[] = [];
  const eff = (c: PlanCandidate<RouteStation>) => c.price + (c.detourKm * lpk * c.price) / 30;
  for (const list of buckets.values()) out.push(...list.sort((a, b) => eff(a) - eff(b)).slice(0, perBucket));
  return out;
}

function candidatesFor(stations: RouteStation[], fuel: FuelType, departure: number, profile: HourProfile, now: number): PlanCandidate<RouteStation>[] {
  const out: PlanCandidate<RouteStation>[] = [];
  for (const rs of stations) {
    const cur = rs.station.prices[fuel];
    if (cur == null) continue;
    const eta = departure + rs.etaOffsetSec * 1000;
    // A station closed now is only excluded if we would arrive within the next hour.
    if (rs.station.isOpen === false && eta - now < HOUR) continue;
    out.push({ ref: rs, alongKm: rs.alongKm, detourKm: rs.detourKm, price: predictPrice(cur, now, eta, profile) });
  }
  return out;
}

export function runPlan(stations: RouteStation[], input: TripInput, route: Route, profile: HourProfile, departure: number, coarse = false) {
  const now = Date.now();
  const lpk = input.vehicle.consumption / 100;
  const all = candidatesFor(stations, input.fuel, departure, profile, now);
  const refPrice = median(all.map((c) => c.price));
  const cands = prune(all, coarse ? 1 : 3, lpk);
  const plan = planRefuel<RouteStation>({
    routeKm: route.distanceKm,
    candidates: cands,
    tankL: input.vehicle.tankL,
    consumption: input.vehicle.consumption,
    startFuelL: input.startFuelL,
    reserveL: input.reserveL,
    endFuelL: input.endFuelL,
    leftoverPrice: Number.isFinite(refPrice) ? refPrice : 1.8,
    stopPenalty: input.stopPenalty,
    stepL: coarse ? Math.max(1, input.vehicle.tankL / 20) : Math.max(0.5, input.vehicle.tankL / 50),
  });
  return { plan, refPrice };
}

export async function planTrip(provider: Provider, input: TripInput, onProgress?: (phase: 'route' | 'stations', done?: number, total?: number) => void): Promise<TripResult> {
  onProgress?.('route');
  let route: Route;
  let fallbackRoute = false;
  try {
    route = await fetchRoute([input.from, input.to], input.routerUrl || undefined);
  } catch (e) {
    if (provider.id !== 'demo') throw e;
    route = straightRoute(input.from, input.to);
    fallbackRoute = true;
  }
  const stations = await findStationsAlong(provider, route, input.corridorKm, (d, t) => onProgress?.('stations', d, t));
  const profile = await routeProfile(provider, stations, input.fuel);
  const { plan, refPrice } = runPlan(stations, input, route, profile, input.departure);

  // Compare departure times over the next 24 h (hourly).
  const departures: DepartureOption[] = [];
  const base = Math.ceil(input.departure / HOUR) * HOUR;
  for (let h = 0; h < 24; h++) {
    const dep = h === 0 ? input.departure : base + (h - 1) * HOUR;
    const r = runPlan(stations, input, route, profile, dep, true);
    departures.push({ departure: dep, objective: r.plan.objective, feasible: r.plan.feasible });
  }

  for (const s of stations) s.currentPrice = s.station.prices[input.fuel] ?? NaN;
  return { input, route, fallbackRoute, stations, profile, plan, refPrice, departures };
}

export function predictedAt(rs: RouteStation, fuel: FuelType, departure: number, profile: HourProfile): number | null {
  const cur = rs.station.prices[fuel];
  if (cur == null) return null;
  return predictPrice(cur, Date.now(), departure + rs.etaOffsetSec * 1000, profile);
}
