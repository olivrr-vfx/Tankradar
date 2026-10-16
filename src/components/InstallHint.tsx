import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { isNative } from '../services/platform';
import { isTauri } from '../services/http';
import { useSettings } from '../store/settings';
import { Icon } from './Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

let deferred: BeforeInstallPromptEvent | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Shows how to install the web app (iOS: "Add to Home Screen"; Chrome/Edge/Android: native prompt). */
export function InstallHint({ force = false }: { force?: boolean }) {
  const t = useT();
  const { installHintDismissed, set } = useSettings();
  const [canPrompt, setCanPrompt] = useState(!!deferred);

  useEffect(() => {
    const on = () => setCanPrompt(true);
    window.addEventListener('beforeinstallprompt', on);
    return () => window.removeEventListener('beforeinstallprompt', on);
  }, []);

  if (isNative() || isTauri() || isStandalone()) return null;
  if (!force && installHintDismissed) return null;
  const ios = isIos();
  if (!ios && !canPrompt && !force) return null;

  return (
    <div className="banner banner-install">
      <Icon name={ios ? 'share' : 'download'} size={20} />
      <span>
        <strong>{t('install.title')}</strong>
        <br />
        <span className="small">{ios ? t('install.ios') : t('install.other')}</span>
      </span>
      <span className="banner-actions">
        {!ios && canPrompt && (
          <button
            className="btn btn-s btn-primary"
            onClick={async () => {
              await deferred?.prompt();
              deferred = null;
              setCanPrompt(false);
            }}
          >
            {t('install.button')}
          </button>
        )}
        {!force && (
          <button className="btn btn-s btn-ghost" onClick={() => set({ installHintDismissed: true })}>
            {t('install.dismiss')}
          </button>
        )}
      </span>
    </div>
  );
}
