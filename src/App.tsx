import { useEffect, useState } from 'react';
import { createHashRouter, NavLink, Outlet, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon, Logo, type IconName } from './components/Icon';
import { NavChooserHost } from './components/NavChooser';
import { ToastHost } from './components/ui';
import { useApplyTheme } from './hooks/useTheme';
import { useT } from './i18n';
import { Calculator } from './screens/Calculator';
import { Favorites } from './screens/Favorites';
import { Logbook } from './screens/Logbook';
import { More } from './screens/More';
import { Onboarding } from './screens/Onboarding';
import { Radar } from './screens/Radar';
import { RoutePlanner } from './screens/RoutePlanner';
import { Settings } from './screens/Settings';
import { StationDetail } from './screens/StationDetail';
import { Stats } from './screens/Stats';
import { isNative, platformName } from './services/platform';
import { useData } from './store/data';
import { haptic } from './services/haptics';
import { useSettings } from './store/settings';

interface NavItem {
  to: string;
  icon: IconName;
  key: string;
}

const SIDEBAR: NavItem[] = [
  { to: '/', icon: 'radar', key: 'nav.radar' },
  { to: '/route', icon: 'route', key: 'nav.route' },
  { to: '/stats', icon: 'chart', key: 'nav.stats' },
  { to: '/calc', icon: 'calc', key: 'nav.calc' },
  { to: '/favorites', icon: 'star', key: 'nav.favorites' },
  { to: '/logbook', icon: 'book', key: 'nav.logbook' },
];

const TABS: NavItem[] = [
  { to: '/', icon: 'radar', key: 'nav.radar' },
  { to: '/route', icon: 'route', key: 'nav.route' },
  { to: '/calc', icon: 'calc', key: 'nav.calc' },
  { to: '/favorites', icon: 'star', key: 'nav.favorites' },
  { to: '/more', icon: 'more', key: 'nav.more' },
];

function useAutoRefresh() {
  const minutes = useSettings((s) => s.autoRefreshMin);
  useEffect(() => {
    if (!minutes) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      const { load, refreshFavorites, center } = useData.getState();
      if (center) void load();
      void refreshFavorites();
    };
    const id = setInterval(tick, minutes * 60_000);
    const onVis = () => {
      const { fetchedAt } = useData.getState();
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt > minutes * 60_000) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [minutes]);
}

function useNativeIntegration() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isNative()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App } = await import('@capacitor/app');
      const h = await App.addListener('backButton', ({ canGoBack }) => {
        if (location.pathname !== '/' && canGoBack) navigate(-1);
        else void App.minimizeApp();
      });
      remove = () => void h.remove();
    })();
    return () => remove?.();
  }, [navigate, location.pathname]);
}

function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const map: Record<string, string> = { '1': '/', '2': '/route', '3': '/stats', '4': '/calc', '5': '/favorites', '6': '/logbook', ',': '/settings' };
      if (map[e.key]) {
        navigate(map[e.key]);
        e.preventDefault();
      } else if (e.key === '/') {
        const input = document.querySelector<HTMLInputElement>('.place-search input');
        if (input) {
          input.focus();
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

function UpdatePrompt() {
  const t = useT();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Installed iOS/Android web apps rarely re-check for updates on their own:
      // check on every return to the app and every 30 minutes.
      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
      setInterval(check, 30 * 60_000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="update-bar">
      {t('update.available')}
      <button className="btn btn-s btn-primary" onClick={() => void updateServiceWorker(true)}>
        {t('update.reload')}
      </button>
    </div>
  );
}

function OfflineBar() {
  const t = useT();
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  if (online) return null;
  return <div className="offline-bar">{t('offline')}</div>;
}

function Layout() {
  const t = useT();
  const onboarded = useSettings((s) => s.onboarded);
  const location = useLocation();
  useApplyTheme();
  useAutoRefresh();
  useNativeIntegration();
  useShortcuts();
  const fullBleed = location.pathname === '/' || location.pathname === '/route';
  const tabIndex = ['/stats', '/logbook', '/settings', '/more'].includes(location.pathname)
    ? 4
    : TABS.findIndex((i) => i.to === location.pathname);

  useEffect(() => {
    document.documentElement.dataset.platform = platformName();
    if (isNative()) {
      void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
        const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => undefined);
      });
    }
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="sidebar" aria-label="Hauptnavigation">
        <NavLink to="/" className="sidebar-logo" aria-label="Tankradar">
          <Logo size={40} />
          <span>Tankradar</span>
        </NavLink>
        {SIDEBAR.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} className="side-link">
            <Icon name={i.icon} size={22} />
            <span>{t(i.key)}</span>
          </NavLink>
        ))}
        <span className="grow" />
        <NavLink to="/settings" className="side-link">
          <Icon name="settings" size={22} />
          <span>{t('nav.settings')}</span>
        </NavLink>
      </nav>
      <main id="main" className={`main ${fullBleed ? 'full-bleed' : ''}`}>
        <OfflineBar />
        <div key={location.pathname.split('/')[1] || 'radar'} className={`route-anim ${fullBleed ? 'fill' : ''}`}>
          <Outlet />
        </div>
      </main>
      <nav className="tabbar" aria-label="Navigation" style={{ ['--tab' as string]: tabIndex }}>
        {tabIndex >= 0 && <span className="tab-indicator" aria-hidden="true" />}
        {TABS.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={() => void haptic('light')} className={({ isActive }) => `tab ${isActive || (i.to === '/more' && ['/stats', '/logbook', '/settings'].includes(location.pathname)) ? 'active' : ''}`}>
            <Icon name={i.icon} size={22} />
            <span>{t(i.key)}</span>
          </NavLink>
        ))}
      </nav>
      {!onboarded && <Onboarding />}
      <NavChooserHost />
      <ToastHost />
      <UpdatePrompt />
    </div>
  );
}

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Radar /> },
      { path: 'station/:id', element: <StationDetail /> },
      { path: 'route', element: <RoutePlanner /> },
      { path: 'stats', element: <Stats /> },
      { path: 'calc', element: <Calculator /> },
      { path: 'favorites', element: <Favorites /> },
      { path: 'logbook', element: <Logbook /> },
      { path: 'settings', element: <Settings /> },
      { path: 'more', element: <More /> },
      { path: '*', element: <Radar /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
