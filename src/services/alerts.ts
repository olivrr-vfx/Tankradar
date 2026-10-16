import type { Station } from '../lib/types';
import { useSettings } from '../store/settings';
import { useUser } from '../store/user';
import { formatPricePlain } from '../i18n/format';
import { translate } from '../i18n';
import { notify } from './platform';

const COOLDOWN = 6 * 3_600_000;

/** Check enabled price alerts against freshly loaded stations and fire notifications. */
export async function checkAlerts(stations: Station[]): Promise<void> {
  const { alerts, saveAlert } = useUser.getState();
  const lang = useSettings.getState().lang;
  const now = Date.now();
  for (const a of alerts) {
    if (!a.enabled || now - a.lastNotified < COOLDOWN) continue;
    let hit: Station | null = null;
    let price = Infinity;
    for (const s of stations) {
      if (a.target !== 'area' && s.id !== a.target) continue;
      if (s.isOpen === false) continue;
      const p = s.prices[a.fuel];
      if (p != null && p <= a.threshold && p < price) {
        price = p;
        hit = s;
      }
    }
    if (!hit) continue;
    saveAlert({ ...a, lastNotified: now });
    await notify(
      translate(lang, 'alert.notifyTitle', { fuel: translate(lang, `fuel.${a.fuel}`) }),
      translate(lang, 'alert.notifyBody', { price: formatPricePlain(price, lang), name: hit.name, place: hit.place }),
    );
  }
}
