/**
 * Demo data source: deterministic, realistic-looking synthetic stations and prices that
 * work anywhere in the world without an API key. Prices follow the typical German intraday
 * pattern, brand differences, regional differences and a slowly moving market trend, and the
 * complete history can be computed for any point in time.
 */
import { DAY, DEFAULT_PROFILE, HOUR, startOfDay } from '../lib/history';
import { haversineKm } from '../lib/geo';
import { hashString, rngFor, valueNoise } from '../lib/random';
import type { FuelType, LatLng, PricePoint, PriceUpdate, Provider, Station } from '../lib/types';

const CELL_LAT = 0.04;
const CELL_LNG = 0.06;

const BRANDS: { name: string; weight: number; offset: number }[] = [
  { name: 'Aral', weight: 20, offset: 0.035 },
  { name: 'Shell', weight: 16, offset: 0.035 },
  { name: 'Esso', weight: 9, offset: 0.02 },
  { name: 'TotalEnergies', weight: 9, offset: 0.02 },
  { name: 'AVIA', weight: 6, offset: 0.0 },
  { name: 'JET', weight: 8, offset: -0.03 },
  { name: 'Star', weight: 6, offset: -0.015 },
  { name: 'HEM', weight: 5, offset: -0.025 },
  { name: 'Agip', weight: 5, offset: 0.01 },
  { name: 'bft', weight: 4, offset: -0.01 },
  { name: 'Raiffeisen', weight: 4, offset: -0.005 },
  { name: 'Freie Tankstelle', weight: 8, offset: -0.035 },
];
const BRAND_TOTAL = BRANDS.reduce((a, b) => a + b.weight, 0);
const STREETS = ['Hauptstraße', 'Bahnhofstraße', 'Industriestraße', 'Berliner Straße', 'Am Markt', 'Ringstraße', 'Lindenallee', 'Gewerbepark', 'Frankfurter Straße', 'Münchner Straße', 'Kirchweg', 'Schulstraße', 'Bundesstraße', 'Hafenstraße', 'Am Kreisel', 'Gartenstraße', 'Wiesenweg', 'Raiffeisenstraße'];
const PLACES = ['Neustadt', 'Altdorf', 'Lindenberg', 'Bergheim', 'Waldkirch', 'Rosenau', 'Steinfeld', 'Mühlhausen', 'Wiesental', 'Hochfeld', 'Eichenau', 'Kirchberg', 'Sonnenbühl', 'Birkenwerder', 'Talheim', 'Seefeld'];
const FREE_NAMES = ['Tankstelle Müller', 'Autohof Schneider', 'Tankcenter Weber', 'Tankstelle am See', 'Tank & Wasch Fischer', 'Tankstelle Becker'];

const FUEL_BASE: Record<FuelType, number> = { e5: 1.769, e10: 1.709, diesel: 1.659 };

interface DemoStationMeta {
  station: Omit<Station, 'prices' | 'isOpen' | 'updatedAt' | 'dist'>;
  baseOffset: number;
  amplitude: number;
  allDay: boolean;
}

const metaCache = new Map<string, DemoStationMeta>();

function cellStations(ci: number, cj: number): DemoStationMeta[] {
  const key = `cell:${ci}:${cj}`;
  const rng = rngFor(key);
  const lat0 = ci * CELL_LAT;
  const lng0 = cj * CELL_LNG;
  const density = valueNoise(lat0 / 0.35, lng0 / 0.5, 'density');
  const count = Math.max(0, Math.round(density * 7 + rng() * 3 - 1));
  const regional = (valueNoise(lat0 / 1.2, lng0 / 1.6, 'region') - 0.5) * 0.07;
  const out: DemoStationMeta[] = [];
  for (let k = 0; k < count; k++) {
    const id = `demo-${ci}-${cj}-${k}`;
    const cached = metaCache.get(id);
    if (cached) {
      out.push(cached);
      continue;
    }
    const r = rngFor(id);
    let pick = r() * BRAND_TOTAL;
    let brand = BRANDS[0];
    for (const b of BRANDS) {
      pick -= b.weight;
      if (pick <= 0) {
        brand = b;
        break;
      }
    }
    const motorway = r() < 0.05;
    const free = brand.name === 'Freie Tankstelle';
    const street = STREETS[Math.floor(r() * STREETS.length)];
    const place = PLACES[hashString(`place:${Math.floor(ci / 3)}:${Math.floor(cj / 3)}`) % PLACES.length];
    const name = motorway
      ? `${free ? 'Autohof' : brand.name} Rastanlage ${place}`
      : free
        ? FREE_NAMES[Math.floor(r() * FREE_NAMES.length)]
        : `${brand.name} ${street}`;
    const meta: DemoStationMeta = {
      station: {
        id,
        name,
        brand: free ? '' : brand.name,
        street: motorway ? `A ${1 + Math.floor(r() * 99)}` : street,
        houseNumber: motorway ? '' : String(1 + Math.floor(r() * 180)),
        postCode: String(10000 + (hashString(`plz:${Math.floor(ci / 2)}:${Math.floor(cj / 2)}`) % 89999)).padStart(5, '0'),
        place,
        lat: lat0 + r() * CELL_LAT,
        lng: lng0 + r() * CELL_LNG,
        source: 'demo',
        wholeDay: false,
      },
      baseOffset: regional + brand.offset + (r() - 0.5) * 0.03 + (motorway ? 0.13 : 0),
      amplitude: 0.7 + r() * 0.6,
      allDay: motorway || r() < 0.78,
    };
    meta.station.wholeDay = meta.allDay;
    meta.station.openingTimes = meta.allDay
      ? []
      : [
          { text: 'Mo-Fr', start: '06:00:00', end: '22:00:00' },
          { text: 'Samstag', start: '07:00:00', end: '22:00:00' },
          { text: 'Sonntag, Feiertag', start: '08:00:00', end: '20:00:00' },
        ];
    metaCache.set(id, meta);
    out.push(meta);
  }
  return out;
}

function metaById(id: string): DemoStationMeta | null {
  const cached = metaCache.get(id);
  if (cached) return cached;
  const m = /^demo-(-?\d+)-(-?\d+)-(\d+)$/.exec(id);
  if (!m) return null;
  return cellStations(Number(m[1]), Number(m[2]))[Number(m[3])] ?? null;
}

const dayIndex = (dayStart: number) => Math.floor((dayStart + 12 * HOUR) / DAY);

function marketLevel(fuel: FuelType, day: number): number {
  const phase = fuel === 'diesel' ? 1.7 : 0;
  const noise = (rngFor(`market:${fuel === 'diesel' ? 'd' : 'b'}:${day}`)() - 0.5) * 0.012;
  return 0.03 * Math.sin((2 * Math.PI * day) / 41 + phase) + 0.018 * Math.sin((2 * Math.PI * day) / 13 + 1 + phase) + noise;
}

/** Price changes of one station/fuel on one day (local time). */
function dayChanges(meta: DemoStationMeta, fuel: FuelType, dayStart: number): PricePoint[] {
  const day = dayIndex(dayStart);
  const r = rngFor(`${meta.station.id}:${fuel}:${day}`);
  const times = new Set<number>();
  // Typical jump points plus random adjustments throughout the day.
  for (const h of [5, 7, 12, 15, 17, 22]) if (r() < 0.85) times.add(h * 60 + Math.floor(r() * 25));
  const extra = 4 + Math.floor(r() * 8);
  for (let i = 0; i < extra; i++) times.add(Math.floor(r() * 24 * 60));
  const sorted = [...times].sort((a, b) => a - b);
  const base = FUEL_BASE[fuel] + meta.baseOffset + marketLevel(fuel, day);
  return sorted.map((min) => {
    const hour = Math.floor(min / 60);
    const p = base + DEFAULT_PROFILE[hour] * meta.amplitude + (r() - 0.5) * 0.012;
    return { t: dayStart + min * 60_000, p: Math.round(p * 100) / 100 + 0.009 };
  });
}

export function demoHistory(id: string, fuel: FuelType, from: number, to: number): PricePoint[] {
  const meta = metaById(id);
  if (!meta) return [];
  const out: PricePoint[] = [];
  const prevDay = dayChanges(meta, fuel, startOfDay(from - DAY));
  let carry = prevDay[prevDay.length - 1];
  for (let d = startOfDay(from); d <= to; d = startOfDay(d + DAY + 2 * HOUR)) {
    for (const pt of dayChanges(meta, fuel, d)) {
      if (pt.t > to) break;
      if (pt.t <= from) carry = pt;
      else out.push(pt);
    }
  }
  if (carry) out.unshift({ t: from, p: carry.p });
  return out;
}

function demoPrice(meta: DemoStationMeta, fuel: FuelType, t: number): number {
  const h = demoHistory(meta.station.id, fuel, t - 1, t);
  return h[h.length - 1]?.p ?? FUEL_BASE[fuel];
}

function isOpenAt(meta: DemoStationMeta, t: number): boolean {
  if (meta.allDay) return true;
  const d = new Date(t);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const dow = d.getDay();
  const [from, to] = dow === 0 ? [8 * 60, 20 * 60] : dow === 6 ? [7 * 60, 22 * 60] : [6 * 60, 22 * 60];
  return minutes >= from && minutes < to;
}

function materialize(meta: DemoStationMeta, now: number, center?: LatLng): Station {
  return {
    ...meta.station,
    dist: center ? haversineKm(center, meta.station) : undefined,
    isOpen: isOpenAt(meta, now),
    prices: { e5: demoPrice(meta, 'e5', now), e10: demoPrice(meta, 'e10', now), diesel: demoPrice(meta, 'diesel', now) },
    updatedAt: now,
  };
}

export function demoStationsAround(center: LatLng, radiusKm: number, now = Date.now()): Station[] {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const out: Station[] = [];
  for (let ci = Math.floor((center.lat - dLat) / CELL_LAT); ci <= Math.floor((center.lat + dLat) / CELL_LAT); ci++) {
    for (let cj = Math.floor((center.lng - dLng) / CELL_LNG); cj <= Math.floor((center.lng + dLng) / CELL_LNG); cj++) {
      for (const meta of cellStations(ci, cj)) {
        if (haversineKm(center, meta.station) <= radiusKm) out.push(materialize(meta, now, center));
      }
    }
  }
  return out.sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const demoProvider: Provider = {
  id: 'demo',
  maxRadiusKm: 25,
  fuels: ['e5', 'e10', 'diesel'],
  async search(center, radiusKm) {
    await sleep(120);
    return demoStationsAround(center, Math.min(radiusKm, 25));
  },
  async detail(id) {
    const meta = metaById(id);
    return meta ? materialize(meta, Date.now()) : null;
  },
  async prices(ids) {
    const now = Date.now();
    const out: Record<string, PriceUpdate> = {};
    for (const id of ids) {
      const meta = metaById(id);
      if (meta) {
        const s = materialize(meta, now);
        out[id] = { isOpen: s.isOpen, prices: s.prices };
      }
    }
    return out;
  },
  async history(id, fuel, from, to) {
    return demoHistory(id, fuel, from, to);
  },
};
