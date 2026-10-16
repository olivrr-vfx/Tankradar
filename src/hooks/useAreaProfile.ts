import { useEffect, useState } from 'react';
import { combineProfiles, DAY, DEFAULT_HOUR_PROFILE, hourlyProfile, type HourProfile } from '../lib/history';
import type { FuelType, Station } from '../lib/types';
import { getProvider } from '../providers';
import { loadHistory } from '../services/historyStore';

const cache = new Map<string, HourProfile>();

/** Learn the intraday pattern of an area from the history of its nearest stations. */
export function useAreaProfile(stations: Station[], fuel: FuelType): HourProfile {
  const sample = stations
    .filter((s) => s.prices[fuel] != null)
    .slice(0, 10)
    .map((s) => s.id);
  const key = `${fuel}|${sample.join(',')}`;
  const [profile, setProfile] = useState<HourProfile>(cache.get(key) ?? DEFAULT_HOUR_PROFILE);

  useEffect(() => {
    if (!sample.length) {
      setProfile(DEFAULT_HOUR_PROFILE);
      return;
    }
    const hit = cache.get(key);
    if (hit) {
      setProfile(hit);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const provider = getProvider();
        const now = Date.now();
        const histories = await Promise.all(sample.map((id) => loadHistory(provider, id, fuel, now - 22 * DAY, now)));
        const profiles = histories.map((h) => hourlyProfile(h, now, 21)).filter((p): p is HourProfile => !!p);
        const combined = profiles.length >= 2 ? combineProfiles(profiles) : null;
        const result = combined ?? DEFAULT_HOUR_PROFILE;
        cache.set(key, result);
        if (!cancelled) setProfile(result);
      } catch {
        if (!cancelled) setProfile(DEFAULT_HOUR_PROFILE);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return profile;
}
