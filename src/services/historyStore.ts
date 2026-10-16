/**
 * Local price history in IndexedDB. Every price the app sees is recorded, so the history of
 * your regular stations grows automatically – even without the optional Tankradar server.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DAY, mergePoints } from '../lib/history';
import { haversineKm } from '../lib/geo';
import type { FuelType, LatLng, PricePoint, Provider, Station } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';

interface Series {
  key: string;
  id: string;
  fuel: FuelType;
  points: PricePoint[];
}

export interface AreaSnapshot {
  t: number;
  lat: number;
  lng: number;
  fuel: FuelType;
  mean: number;
  min: number;
  n: number;
}

interface TankradarDB extends DBSchema {
  series: { key: string; value: Series };
  stations: { key: string; value: Station };
  area: { key: number; value: AreaSnapshot; indexes: { t: number } };
}

const KEEP_MS = 180 * DAY;
let dbp: Promise<IDBPDatabase<TankradarDB>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<TankradarDB>('tankradar', 1, {
      upgrade(d) {
        d.createObjectStore('series', { keyPath: 'key' });
        d.createObjectStore('stations', { keyPath: 'id' });
        const area = d.createObjectStore('area', { autoIncrement: true });
        area.createIndex('t', 't');
      },
    });
  }
  return dbp;
}

const keyOf = (id: string, fuel: FuelType) => `${id}|${fuel}`;

export async function recordStations(stations: Station[]): Promise<void> {
  if (!stations.length) return;
  try {
    const d = await db();
    const tx = d.transaction(['series', 'stations'], 'readwrite');
    const series = tx.objectStore('series');
    const meta = tx.objectStore('stations');
    const cutoff = Date.now() - KEEP_MS;
    for (const s of stations) {
      if (s.source === 'demo') continue; // demo history is computed on the fly
      void meta.put({ ...s, dist: undefined });
      for (const fuel of FUEL_TYPES) {
        const p = s.prices[fuel];
        if (p == null) continue;
        const k = keyOf(s.id, fuel);
        const existing = (await series.get(k)) ?? { key: k, id: s.id, fuel, points: [] };
        const last = existing.points[existing.points.length - 1];
        if (last && (Math.abs(last.p - p) < 1e-6 || last.t >= s.updatedAt)) continue;
        existing.points.push({ t: s.updatedAt, p });
        existing.points = existing.points.filter((pt) => pt.t >= cutoff);
        void series.put(existing);
      }
    }
    await tx.done;
  } catch (e) {
    console.warn('history: record failed', e);
  }
}

export async function localHistory(id: string, fuel: FuelType): Promise<PricePoint[]> {
  try {
    return (await (await db()).get('series', keyOf(id, fuel)))?.points ?? [];
  } catch {
    return [];
  }
}

export async function cachedStation(id: string): Promise<Station | null> {
  try {
    return (await (await db()).get('stations', id)) ?? null;
  } catch {
    return null;
  }
}

/** Remote (if available) merged with locally recorded history. */
export async function loadHistory(provider: Provider, id: string, fuel: FuelType, from: number, to: number): Promise<PricePoint[]> {
  const [remote, local] = await Promise.all([
    provider.history ? provider.history(id, fuel, from, to).catch(() => [] as PricePoint[]) : Promise.resolve([]),
    localHistory(id, fuel),
  ]);
  return mergePoints(remote, local.filter((p) => p.t <= to));
}

export async function recordArea(center: LatLng, fuel: FuelType, mean: number, min: number, n: number): Promise<void> {
  if (!Number.isFinite(mean) || n < 2) return;
  try {
    const d = await db();
    const recent = await d.getAllFromIndex('area', 't', IDBKeyRange.lowerBound(Date.now() - 20 * 60_000));
    if (recent.some((r) => r.fuel === fuel && haversineKm(r, center) < 3)) return;
    await d.add('area', { t: Date.now(), lat: center.lat, lng: center.lng, fuel, mean, min, n });
  } catch {
    /* ignore */
  }
}

export async function areaSnapshots(center: LatLng, fuel: FuelType, from: number, maxKm = 15): Promise<AreaSnapshot[]> {
  try {
    const d = await db();
    const all = await d.getAllFromIndex('area', 't', IDBKeyRange.lowerBound(from));
    return all.filter((r) => r.fuel === fuel && haversineKm(r, center) <= maxKm);
  } catch {
    return [];
  }
}

export async function clearHistory(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear('series'), d.clear('stations'), d.clear('area')]);
}

export async function exportHistory(): Promise<{ series: Series[]; area: AreaSnapshot[] }> {
  const d = await db();
  return { series: await d.getAll('series'), area: await d.getAll('area') };
}

export async function importHistory(data: { series?: Series[]; area?: AreaSnapshot[] }): Promise<void> {
  const d = await db();
  const tx = d.transaction(['series', 'area'], 'readwrite');
  for (const s of data.series ?? []) {
    const existing = await tx.objectStore('series').get(s.key);
    await tx.objectStore('series').put({ ...s, points: mergePoints(existing?.points ?? [], s.points) });
  }
  for (const a of data.area ?? []) await tx.objectStore('area').add(a);
  await tx.done;
}
