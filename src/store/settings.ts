import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NavApp } from '../lib/deeplinks';
import type { FuelType, LatLng, ProviderId } from '../lib/types';

export type Theme = 'system' | 'light' | 'dark';
export type Lang = 'de' | 'en';
export type SortMode = 'price' | 'dist';

export interface SettingsState {
  provider: ProviderId;
  tkApiKey: string;
  serverUrl: string;
  routerUrl: string;
  fuel: FuelType;
  radiusKm: number;
  sort: SortMode;
  onlyOpen: boolean;
  hiddenBrands: string[];
  theme: Theme;
  lang: Lang;
  /** Last used / manually chosen location. */
  location: LatLng | null;
  locationLabel: string;
  navApp: NavApp | 'ask';
  autoRefreshMin: number;
  onboarded: boolean;
  installHintDismissed: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const DEFAULT_LOCATION: LatLng = { lat: 50.1109, lng: 8.6821 }; // Frankfurt am Main

const browserLang = (): Lang => (typeof navigator !== 'undefined' && !navigator.language.startsWith('de') ? 'en' : 'de');

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      provider: 'demo',
      tkApiKey: '',
      serverUrl: '',
      routerUrl: '',
      fuel: 'e10',
      radiusKm: 5,
      sort: 'price',
      onlyOpen: false,
      hiddenBrands: [],
      theme: 'system',
      lang: browserLang(),
      location: null,
      locationLabel: '',
      navApp: 'ask',
      autoRefreshMin: 5,
      onboarded: false,
      installHintDismissed: false,
      set: (patch) => set(patch),
    }),
    { name: 'tankradar.settings', version: 1 },
  ),
);
