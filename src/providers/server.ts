/**
 * Self-hosted Tankradar server (see /server). It collects prices continuously, so it can
 * deliver complete price histories and area statistics, and it keeps your API key private.
 */
import { getJson } from '../services/http';
import type { FuelType, PricePoint, PriceUpdate, Provider, Station } from '../lib/types';

export function createServerProvider(baseUrl: string): Provider {
  const base = baseUrl.replace(/\/+$/, '');
  return {
    id: 'server',
    maxRadiusKm: 25,
    fuels: ['e5', 'e10', 'diesel'],
    async search(center, radiusKm) {
      const res = await getJson<{ stations: Station[] }>(`${base}/api/stations?lat=${center.lat}&lng=${center.lng}&rad=${radiusKm}`);
      return res.stations.map((s) => ({ ...s, source: 'server' as const }));
    },
    async detail(id) {
      const res = await getJson<{ station: Station | null }>(`${base}/api/stations/${encodeURIComponent(id)}`);
      return res.station ? { ...res.station, source: 'server' } : null;
    },
    async prices(ids) {
      const res = await getJson<{ prices: Record<string, PriceUpdate> }>(`${base}/api/prices?ids=${ids.map(encodeURIComponent).join(',')}`);
      return res.prices;
    },
    async history(id: string, fuel: FuelType, from: number, to: number) {
      const res = await getJson<{ points: PricePoint[] }>(
        `${base}/api/history/${encodeURIComponent(id)}?fuel=${fuel}&from=${from}&to=${to}`,
      );
      return res.points;
    },
  };
}
