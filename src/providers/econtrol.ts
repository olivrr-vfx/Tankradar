/**
 * E-Control Spritpreisrechner (Austria). No key required.
 * https://api.e-control.at/sprit/1.0/doc/index.html
 * The API only reports prices for the cheapest stations of a query; others are listed without prices.
 */
import { haversineKm } from '../lib/geo';
import { getJson } from '../services/http';
import type { FuelType, LatLng, OpeningTime, PriceUpdate, Provider, Station } from '../lib/types';

const BASE = 'https://api.e-control.at/sprit/1.0';

interface EcStation {
  id: number;
  name: string;
  location: { address: string; postalCode: string; city: string; latitude: number; longitude: number };
  open: boolean;
  distance?: number;
  prices: { fuelType: string; amount: number; label?: string }[];
  openingHours?: { day: string; label: string; from: string; to: string }[];
}

const FUELS: [FuelType, string][] = [
  ['e5', 'SUP'],
  ['diesel', 'DIE'],
];

function brandOf(name: string): string {
  const known = ['BP', 'OMV', 'Shell', 'ENI', 'JET', 'Avanti', 'Turmöl', 'Diskont', 'SOCAR', 'Genol', 'A1', 'IQ', 'Lagerhaus', 'Doppler', 'MOL', 'Avia'];
  const hit = known.find((k) => name.toLowerCase().includes(k.toLowerCase()));
  return hit ?? '';
}

function toStation(s: EcStation, center: LatLng | null, now: number): Station {
  const street = s.location.address || '';
  return {
    id: `at-${s.id}`,
    name: s.name.trim(),
    brand: brandOf(s.name),
    street,
    houseNumber: '',
    postCode: s.location.postalCode,
    place: s.location.city,
    lat: s.location.latitude,
    lng: s.location.longitude,
    dist: center ? haversineKm(center, { lat: s.location.latitude, lng: s.location.longitude }) : s.distance,
    isOpen: s.open,
    prices: {},
    openingTimes: (s.openingHours ?? []).map<OpeningTime>((o) => ({ text: o.label, start: `${o.from}:00`, end: `${o.to}:00` })),
    source: 'econtrol',
    updatedAt: now,
  };
}

export function createEControlProvider(base = BASE): Provider {
  const cache = new Map<string, Station>();
  const query = async (center: LatLng) => {
    const now = Date.now();
    const merged = new Map<string, Station>();
    for (const [fuel, code] of FUELS) {
      const list = await getJson<EcStation[]>(
        `${base}/search/gas-stations/by-address?latitude=${center.lat.toFixed(5)}&longitude=${center.lng.toFixed(5)}&fuelType=${code}&includeClosed=true`,
      );
      for (const s of list) {
        const st = merged.get(`at-${s.id}`) ?? toStation(s, center, now);
        const price = s.prices?.find((p) => p.fuelType === code)?.amount;
        st.prices[fuel] = typeof price === 'number' && price > 0 ? price : null;
        merged.set(st.id, st);
      }
    }
    for (const s of merged.values()) cache.set(s.id, s);
    return [...merged.values()];
  };
  return {
    id: 'econtrol',
    maxRadiusKm: 25,
    fuels: FUELS.map(([f]) => f),
    async search(center, radiusKm) {
      const list = await query(center);
      return list.filter((s) => (s.dist ?? 0) <= radiusKm + 2).sort((a, b) => (a.dist ?? 0) - (b.dist ?? 0));
    },
    async detail(id) {
      return cache.get(id) ?? null;
    },
    async prices(ids) {
      // No per-station endpoint: refresh around the known stations.
      const out: Record<string, PriceUpdate> = {};
      const known = ids.map((id) => cache.get(id)).filter((s): s is Station => !!s);
      const done = new Set<string>();
      for (const s of known) {
        if (done.has(s.id)) continue;
        for (const fresh of await query(s)) {
          done.add(fresh.id);
          out[fresh.id] = { isOpen: fresh.isOpen, prices: fresh.prices };
        }
      }
      return out;
    },
  };
}
