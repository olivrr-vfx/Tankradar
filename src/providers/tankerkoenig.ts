/**
 * Tankerkönig API (Germany, data from the Markttransparenzstelle für Kraftstoffe, CC BY 4.0).
 * Free API key: https://creativecommons.tankerkoenig.de
 */
import { getJson, pool } from '../services/http';
import type { FuelType, OpeningTime, PriceUpdate, Provider, Station } from '../lib/types';

const BASE = 'https://creativecommons.tankerkoenig.de/json';

interface TkStation {
  id: string;
  name: string;
  brand: string;
  street: string;
  houseNumber: string | null;
  postCode: number | string;
  place: string;
  lat: number;
  lng: number;
  dist?: number;
  e5?: number | false | null;
  e10?: number | false | null;
  diesel?: number | false | null;
  isOpen: boolean;
  openingTimes?: OpeningTime[];
  wholeDay?: boolean;
}

interface TkList {
  ok: boolean;
  message?: string;
  stations: TkStation[];
}

const num = (v: unknown) => (typeof v === 'number' && v > 0 ? v : null);

export function mapTkStation(s: TkStation, now = Date.now()): Station {
  return {
    id: s.id,
    name: (s.name || s.brand || 'Tankstelle').trim(),
    brand: (s.brand || '').trim(),
    street: titleCase(s.street || ''),
    houseNumber: s.houseNumber?.trim() || '',
    postCode: String(s.postCode ?? '').padStart(5, '0'),
    place: titleCase(s.place || ''),
    lat: s.lat,
    lng: s.lng,
    dist: s.dist,
    isOpen: s.isOpen ?? null,
    prices: { e5: num(s.e5), e10: num(s.e10), diesel: num(s.diesel) },
    openingTimes: s.openingTimes,
    wholeDay: s.wholeDay,
    source: 'tankerkoenig',
    updatedAt: now,
  };
}

/** Tankerkönig delivers many addresses in UPPER CASE – make them readable. */
export function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s.trim();
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-zäöüß])/g, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/Str\.?(\s|$)/g, 'Str.$1')
    .trim();
}

export function createTankerkoenigProvider(apiKey: string, base = BASE): Provider {
  const key = encodeURIComponent(apiKey.trim());
  return {
    id: 'tankerkoenig',
    maxRadiusKm: 25,
    fuels: ['e5', 'e10', 'diesel'] satisfies FuelType[],
    async search(center, radiusKm) {
      const rad = Math.min(25, Math.max(1, radiusKm));
      const url = `${base}/list.php?lat=${center.lat.toFixed(5)}&lng=${center.lng.toFixed(5)}&rad=${rad}&sort=dist&type=all&apikey=${key}`;
      const res = await getJson<TkList>(url);
      if (!res.ok) throw new Error(res.message || 'Tankerkönig: Anfrage fehlgeschlagen');
      const now = Date.now();
      return res.stations.map((s) => mapTkStation(s, now));
    },
    async detail(id) {
      const res = await getJson<{ ok: boolean; message?: string; station: TkStation }>(`${base}/detail.php?id=${encodeURIComponent(id)}&apikey=${key}`);
      if (!res.ok) throw new Error(res.message || 'Tankerkönig: Detail fehlgeschlagen');
      return mapTkStation(res.station);
    },
    async prices(ids) {
      const chunks: string[][] = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));
      const out: Record<string, PriceUpdate> = {};
      await pool(chunks, 2, async (chunk) => {
        const res = await getJson<{
          ok: boolean;
          prices: Record<string, { status: string; e5?: number | false; e10?: number | false; diesel?: number | false }>;
        }>(`${base}/prices.php?ids=${chunk.join(',')}&apikey=${key}`);
        if (!res.ok) return;
        for (const [id, p] of Object.entries(res.prices)) {
          out[id] = {
            isOpen: p.status === 'open' ? true : p.status === 'closed' ? false : null,
            prices: { e5: num(p.e5), e10: num(p.e10), diesel: num(p.diesel) },
          };
        }
      });
      return out;
    },
  };
}
