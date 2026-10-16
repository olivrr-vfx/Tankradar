import { create } from 'zustand';
import { useT } from '../i18n';
import { navUrl, type NavApp } from '../lib/deeplinks';
import type { LatLng } from '../lib/types';
import { isAppleDevice, openExternal, platformName } from '../services/platform';
import { useSettings } from '../store/settings';
import { Icon } from './Icon';
import { Modal } from './ui';

interface NavRequest {
  dest: LatLng;
  name?: string;
  origin?: LatLng;
  waypoints?: LatLng[];
}

const useNav = create<{ req: NavRequest | null; set: (r: NavRequest | null) => void }>((set) => ({ req: null, set: (req) => set({ req }) }));

/** Start navigation with the preferred app, or ask which one to use. */
export function startNavigation(req: NavRequest) {
  const pref = useSettings.getState().navApp;
  if (pref !== 'ask') {
    void openExternal(navUrl(pref, req.dest, req));
    return;
  }
  useNav.getState().set(req);
}

export function availableNavApps(): NavApp[] {
  const p = platformName();
  const apps: NavApp[] = [];
  if (isAppleDevice()) apps.push('apple');
  apps.push('google', 'waze');
  if (p === 'android') apps.push('geo');
  apps.push('osm');
  return apps;
}

export function NavChooserHost() {
  const t = useT();
  const { req, set } = useNav();
  return (
    <Modal open={!!req} onClose={() => set(null)} title={t('nav.chooseApp')}>
      <div className="nav-apps">
        {req &&
          availableNavApps().map((app) => (
            <button
              key={app}
              className="nav-app"
              onClick={() => {
                void openExternal(navUrl(app, req.dest, req));
                set(null);
              }}
            >
              <span className={`nav-app-icon app-${app}`}>
                <Icon name={app === 'geo' ? 'map' : 'navigate'} size={18} />
              </span>
              {t(`nav.${app}`)}
              <Icon name="external" size={16} className="muted" />
            </button>
          ))}
      </div>
    </Modal>
  );
}
