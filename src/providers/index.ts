import type { Provider } from '../lib/types';
import { useSettings } from '../store/settings';
import { demoProvider } from './demo';
import { createEControlProvider } from './econtrol';
import { createServerProvider } from './server';
import { createTankerkoenigProvider } from './tankerkoenig';

let cached: { key: string; provider: Provider } | null = null;

export class ConfigError extends Error {}

export function getProvider(): Provider {
  const s = useSettings.getState();
  const key = `${s.provider}|${s.tkApiKey}|${s.serverUrl}`;
  if (cached?.key === key) return cached.provider;
  let provider: Provider;
  switch (s.provider) {
    case 'tankerkoenig':
      if (!s.tkApiKey.trim()) throw new ConfigError('missingKey');
      provider = createTankerkoenigProvider(s.tkApiKey);
      break;
    case 'econtrol':
      provider = createEControlProvider();
      break;
    case 'server':
      if (!s.serverUrl.trim()) throw new ConfigError('missingServer');
      provider = createServerProvider(s.serverUrl);
      break;
    default:
      provider = demoProvider;
  }
  cached = { key, provider };
  return provider;
}

export const ATTRIBUTION: Record<string, { label: string; url: string }> = {
  demo: { label: 'Demo-Daten (simuliert)', url: 'https://github.com/olivrr-vfx/tankradar' },
  tankerkoenig: { label: 'Tankerkönig.de / MTS-K (CC BY 4.0)', url: 'https://creativecommons.tankerkoenig.de' },
  econtrol: { label: 'E-Control Spritpreisrechner', url: 'https://www.e-control.at' },
  server: { label: 'Tankradar-Server · Tankerkönig.de / MTS-K (CC BY 4.0)', url: 'https://creativecommons.tankerkoenig.de' },
};
