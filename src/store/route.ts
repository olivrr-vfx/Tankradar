import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLng } from '../lib/types';
import type { TripResult } from '../services/tripPlanner';

export interface NamedPoint extends LatLng {
  label: string;
}

interface RouteState {
  from: NamedPoint | null;
  to: NamedPoint | null;
  fuelPct: number;
  corridorKm: number;
  stopPenalty: number;
  endFuelPct: number;
  result: TripResult | null;
  set: (p: Partial<Omit<RouteState, 'set'>>) => void;
}

export const useRoute = create<RouteState>()(
  persist(
    (set) => ({
      from: null,
      to: null,
      fuelPct: 25,
      corridorKm: 3,
      stopPenalty: 2,
      endFuelPct: 0,
      result: null,
      set: (p) => set(p),
    }),
    {
      name: 'tankradar.route',
      partialize: ({ from, to, fuelPct, corridorKm, stopPenalty, endFuelPct }) => ({ from, to, fuelPct, corridorKm, stopPenalty, endFuelPct }),
    },
  ),
);
