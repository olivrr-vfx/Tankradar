import { useMemo } from 'react';
import { priceLevel, summarize, type PriceLevel, type Summary } from '../lib/stats';
import type { FuelType, Station } from '../lib/types';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';

export interface StationsView {
  list: Station[];
  all: Station[];
  summary: Summary | null;
  levelOf: (s: Station) => PriceLevel;
  fuel: FuelType;
}

/** Filtered + sorted station list for the current fuel with area summary. */
export function useStationsView(): StationsView {
  const stations = useData((s) => s.stations);
  const { fuel, sort, onlyOpen, hiddenBrands } = useSettings();
  return useMemo(() => {
    const withPrice = stations.filter((s) => !hiddenBrands.includes(s.brand || ''));
    const open = withPrice.filter((s) => s.isOpen !== false);
    const summary = summarize(open.map((s) => s.prices[fuel] ?? NaN));
    let list = onlyOpen ? open : withPrice;
    list = [...list].sort((a, b) => {
      if (sort === 'dist') return (a.dist ?? 0) - (b.dist ?? 0);
      const pa = a.isOpen === false ? 99 : (a.prices[fuel] ?? 98);
      const pb = b.isOpen === false ? 99 : (b.prices[fuel] ?? 98);
      return pa - pb || (a.dist ?? 0) - (b.dist ?? 0);
    });
    const levelOf = (s: Station) => priceLevel(s.prices[fuel] ?? NaN, summary);
    return { list, all: stations, summary, levelOf, fuel };
  }, [stations, fuel, sort, onlyOpen, hiddenBrands]);
}
