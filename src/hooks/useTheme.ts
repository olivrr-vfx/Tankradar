import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from '../store/settings';

const mq = () => window.matchMedia?.('(prefers-color-scheme: dark)');

function subscribe(cb: () => void) {
  const m = mq();
  m?.addEventListener('change', cb);
  return () => m?.removeEventListener('change', cb);
}

/** Reactive "is the UI dark right now?" */
export function useIsDark(): boolean {
  const theme = useSettings((s) => s.theme);
  const systemDark = useSyncExternalStore(subscribe, () => mq()?.matches ?? false, () => false);
  return theme === 'dark' || (theme === 'system' && systemDark);
}

/** Applies the theme to <html> and the browser chrome colour. */
export function useApplyTheme() {
  const theme = useSettings((s) => s.theme);
  const dark = useIsDark();
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0f1a' : '#f4f6fa');
  }, [theme, dark]);
}
