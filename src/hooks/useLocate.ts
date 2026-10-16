import { useCallback, useState } from 'react';
import { toast } from '../components/ui';
import { useT } from '../i18n';
import { getPosition } from '../services/platform';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { reverseGeocode } from '../services/geocode';
import type { LatLng } from '../lib/types';

export function useLocate() {
  const t = useT();
  const [locating, setLocating] = useState(false);
  const locate = useCallback(async (): Promise<LatLng | null> => {
    setLocating(true);
    try {
      const p = await getPosition();
      useData.getState().setGps(p);
      useSettings.getState().set({ location: p, locationLabel: t('route.myLocation') });
      void useData.getState().load(p);
      reverseGeocode(p).then((label) => label && useSettings.getState().set({ locationLabel: label }));
      return p;
    } catch {
      toast(t('error.location'));
      return null;
    } finally {
      setLocating(false);
    }
  }, [t]);
  return { locate, locating };
}
