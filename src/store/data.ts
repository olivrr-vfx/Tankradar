import { create } from 'zustand';
import { summarize } from '../lib/stats';
import type { LatLng, Station } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { ConfigError, getProvider } from '../providers';
import { checkAlerts } from '../services/alerts';
import { recordArea, recordStations } from '../services/historyStore';
import { useSettings } from './settings';
import { useUser } from './user';

interface DataState {
  center: LatLng | null;
  stations: Station[];
  loading: boolean;
  error: string | null;
  fetchedAt: number;
  gps: LatLng | null;
  setGps: (p: LatLng | null) => void;
  load: (center?: LatLng) => Promise<void>;
  refreshFavorites: () => Promise<void>;
}

export const useData = create<DataState>()((set, get) => ({
  center: null,
  stations: [],
  loading: false,
  error: null,
  fetchedAt: 0,
  gps: null,
  setGps: (gps) => set({ gps }),
  async load(center) {
    const c = center ?? get().center;
    if (!c) return;
    set({ loading: true, error: null, center: c });
    try {
      const provider = getProvider();
      const { radiusKm } = useSettings.getState();
      const stations = await provider.search(c, Math.min(radiusKm, provider.maxRadiusKm));
      // Ignore out-of-date responses.
      if (get().center !== c) return;
      set({ stations, loading: false, fetchedAt: Date.now() });
      void recordStations(stations);
      for (const fuel of FUEL_TYPES) {
        const s = summarize(stations.filter((x) => x.isOpen !== false).map((x) => x.prices[fuel] ?? NaN));
        if (s) void recordArea(c, fuel, s.mean, s.min, s.n);
      }
      const { favorites, updateFavorite } = useUser.getState();
      for (const st of stations) if (favorites[st.id]) updateFavorite(st);
      void checkAlerts(stations);
    } catch (e) {
      const msg = e instanceof ConfigError ? e.message : e instanceof Error ? e.message : String(e);
      set({ loading: false, error: msg });
    }
  },
  async refreshFavorites() {
    const { favorites, updateFavorite } = useUser.getState();
    const ids = Object.keys(favorites);
    if (!ids.length) return;
    try {
      const provider = getProvider();
      const updates = await provider.prices(ids);
      const now = Date.now();
      const changed: Station[] = [];
      for (const [id, u] of Object.entries(updates)) {
        const fav = useUser.getState().favorites[id];
        if (!fav) continue;
        const s = { ...fav, isOpen: u.isOpen, prices: { ...fav.prices, ...u.prices }, updatedAt: now };
        updateFavorite(s);
        changed.push(s);
      }
      void recordStations(changed);
      void checkAlerts(changed);
    } catch {
      /* offline or misconfigured – the UI shows the last known values */
    }
  },
}));
