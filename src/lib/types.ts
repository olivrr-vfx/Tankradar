export type FuelType = 'e5' | 'e10' | 'diesel';
export const FUEL_TYPES: FuelType[] = ['e5', 'e10', 'diesel'];

export type ProviderId = 'demo' | 'tankerkoenig' | 'econtrol' | 'server';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OpeningTime {
  text: string;
  start: string;
  end: string;
}

export type Prices = Partial<Record<FuelType, number | null>>;

export interface Station extends LatLng {
  id: string;
  name: string;
  brand: string;
  street: string;
  houseNumber?: string;
  postCode: string;
  place: string;
  /** Distance to the search center in km (if known). */
  dist?: number;
  isOpen: boolean | null;
  prices: Prices;
  openingTimes?: OpeningTime[];
  wholeDay?: boolean;
  source: ProviderId;
  /** Unix ms when the prices were fetched. */
  updatedAt: number;
}

/** A price change: from `t` on the price was `p` (EUR/l). */
export interface PricePoint {
  t: number;
  p: number;
}

export interface PriceUpdate {
  isOpen: boolean | null;
  prices: Prices;
}

export interface Provider {
  id: ProviderId;
  /** Max search radius in km supported by the backend. */
  maxRadiusKm: number;
  fuels: FuelType[];
  search(center: LatLng, radiusKm: number): Promise<Station[]>;
  detail(id: string): Promise<Station | null>;
  prices(ids: string[]): Promise<Record<string, PriceUpdate>>;
  /** Remote history if the backend offers it. */
  history?(id: string, fuel: FuelType, from: number, to: number): Promise<PricePoint[]>;
}

export interface Vehicle {
  id: string;
  name: string;
  fuel: FuelType;
  tankL: number;
  /** l/100km */
  consumption: number;
}
