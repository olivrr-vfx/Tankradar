import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FuelType, Station, Vehicle } from '../lib/types';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export interface PriceAlert {
  id: string;
  /** station id, or "area" for "any station in my radius". */
  target: string;
  label: string;
  fuel: FuelType;
  threshold: number;
  enabled: boolean;
  lastNotified: number;
}

export interface LogEntry {
  id: string;
  date: number;
  vehicleId: string;
  stationName: string;
  fuel: FuelType;
  liters: number;
  pricePerL: number;
  odometer: number | null;
  full: boolean;
  note: string;
}

interface UserState {
  favorites: Record<string, Station>;
  vehicles: Vehicle[];
  activeVehicleId: string;
  alerts: PriceAlert[];
  log: LogEntry[];
  toggleFavorite: (s: Station) => void;
  updateFavorite: (s: Station) => void;
  saveVehicle: (v: Vehicle) => void;
  removeVehicle: (id: string) => void;
  setActiveVehicle: (id: string) => void;
  saveAlert: (a: PriceAlert) => void;
  removeAlert: (id: string) => void;
  saveLog: (e: LogEntry) => void;
  removeLog: (id: string) => void;
  replaceAll: (data: Partial<Pick<UserState, 'favorites' | 'vehicles' | 'activeVehicleId' | 'alerts' | 'log'>>) => void;
}

const DEFAULT_VEHICLE: Vehicle = { id: 'default', name: 'Mein Auto', fuel: 'e10', tankL: 50, consumption: 6.5 };

export const useUser = create<UserState>()(
  persist(
    (set) => ({
      favorites: {},
      vehicles: [DEFAULT_VEHICLE],
      activeVehicleId: DEFAULT_VEHICLE.id,
      alerts: [],
      log: [],
      toggleFavorite: (s) =>
        set((st) => {
          const favorites = { ...st.favorites };
          if (favorites[s.id]) delete favorites[s.id];
          else favorites[s.id] = { ...s, dist: undefined };
          return { favorites };
        }),
      updateFavorite: (s) => set((st) => (st.favorites[s.id] ? { favorites: { ...st.favorites, [s.id]: { ...s, dist: undefined } } } : st)),
      saveVehicle: (v) =>
        set((st) => ({
          vehicles: st.vehicles.some((x) => x.id === v.id) ? st.vehicles.map((x) => (x.id === v.id ? v : x)) : [...st.vehicles, v],
        })),
      removeVehicle: (id) =>
        set((st) => {
          const vehicles = st.vehicles.filter((v) => v.id !== id);
          if (!vehicles.length) vehicles.push(DEFAULT_VEHICLE);
          return { vehicles, activeVehicleId: st.activeVehicleId === id ? vehicles[0].id : st.activeVehicleId };
        }),
      setActiveVehicle: (id) => set({ activeVehicleId: id }),
      saveAlert: (a) => set((st) => ({ alerts: st.alerts.some((x) => x.id === a.id) ? st.alerts.map((x) => (x.id === a.id ? a : x)) : [...st.alerts, a] })),
      removeAlert: (id) => set((st) => ({ alerts: st.alerts.filter((a) => a.id !== id) })),
      saveLog: (e) =>
        set((st) => ({
          log: (st.log.some((x) => x.id === e.id) ? st.log.map((x) => (x.id === e.id ? e : x)) : [...st.log, e]).sort((a, b) => b.date - a.date),
        })),
      removeLog: (id) => set((st) => ({ log: st.log.filter((e) => e.id !== id) })),
      replaceAll: (data) => set(data),
    }),
    { name: 'tankradar.user', version: 1 },
  ),
);

export const useActiveVehicle = () =>
  useUser((s) => s.vehicles.find((v) => v.id === s.activeVehicleId) ?? s.vehicles[0]);
