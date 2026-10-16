import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MapView, type MapPin } from '../components/MapView';
import { Attribution } from '../components/Attribution';
import { InstallHint } from '../components/InstallHint';
import { PlaceSearch } from '../components/PlaceSearch';
import { Sheet, type SheetState } from '../components/Sheet';
import { StationRow } from '../components/StationRow';
import { Empty, PriceTag, Segmented, Spinner, Stat, Toggle } from '../components/ui';
import { useAreaProfile } from '../hooks/useAreaProfile';
import { useLocate } from '../hooks/useLocate';
import { useStationsView } from '../hooks/useStationsView';
import { formatAgo, formatNum, formatTime } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { haversineKm } from '../lib/geo';
import { nextCheapWindow } from '../lib/history';
import type { FuelType, LatLng } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { getProvider } from '../providers';
import { useData } from '../store/data';
import { DEFAULT_LOCATION, useSettings } from '../store/settings';
import { useUser } from '../store/user';
import { useIsDark } from '../hooks/useTheme';

export function FuelSwitch({ size = 'm' }: { size?: 's' | 'm' }) {
  const t = useT();
  const { fuel, provider, set } = useSettings();
  let fuels: FuelType[] = FUEL_TYPES;
  try {
    fuels = getProvider().fuels;
  } catch {
    /* not configured yet */
  }
  void provider;
  return (
    <Segmented
      size={size}
      value={fuels.includes(fuel) ? fuel : fuels[0]}
      ariaLabel="Kraftstoff"
      options={fuels.map((f) => ({ value: f, label: t(`fuel.short.${f}`) }))}
      onChange={(f) => set({ fuel: f })}
    />
  );
}

export function Radar() {
  const t = useT();
  const lang = useLang();
  const navigate = useNavigate();
  const settings = useSettings();
  const { center, loading, error, fetchedAt, gps, load } = useData();
  const view = useStationsView();
  const favorites = useUser((s) => s.favorites);
  const { locate, locating } = useLocate();
  const dark = useIsDark();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [sheet, setSheet] = useState<SheetState>('half');
  const profile = useAreaProfile(view.list, view.fuel);

  // Initial location
  useEffect(() => {
    if (center) return;
    const start = settings.location ?? DEFAULT_LOCATION;
    void load(start).then(() => setFitKey((k) => k + 1));
    if (!settings.location) void locate().then((p) => p && setFitKey((k) => k + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when radius or provider changes
  useEffect(() => {
    if (center) void load(center).then(() => setFitKey((k) => k + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.radiusKm, settings.provider, settings.tkApiKey, settings.serverUrl]);

  const pins: MapPin[] = useMemo(
    () =>
      view.list
        .filter((s) => s.prices[view.fuel] != null || s.isOpen !== false)
        .map((s, i) => ({
          id: s.id,
          lat: s.lat,
          lng: s.lng,
          price: s.prices[view.fuel] ?? null,
          level: view.levelOf(s),
          closed: s.isOpen === false,
          title: s.name,
          badge: settings.sort === 'price' && i === 0 && s.isOpen !== false ? '★' : undefined,
          // Declutter dense areas: only the 30 best get a price pill.
          minor: view.list.length > 40 && i >= 30,
        })),
    [view, settings.sort],
  );

  const movedAway = mapCenter && center ? haversineKm(mapCenter, center) > Math.max(1.5, settings.radiusKm * 0.5) : false;
  const cheapest = view.list.find((s) => s.isOpen !== false && s.prices[view.fuel] != null);
  const tip = nextCheapWindow(Date.now(), profile, 18);
  const isDemo = settings.provider === 'demo';

  const header = (
    <div className="sheet-summary">
      {cheapest && view.summary ? (
        <>
          <span className="muted small">{t('radar.cheapest')}</span>
          <PriceTag price={cheapest.prices[view.fuel]} size="m" level="cheap" />
          <span className="muted small">· {t('radar.average')}</span>
          <PriceTag price={view.summary.mean} size="m" />
        </>
      ) : (
        <span className="muted small">{loading ? t('common.loading') : t('radar.stations', { n: view.list.length })}</span>
      )}
    </div>
  );

  return (
    <div className="radar">
      <MapView
        dark={dark}
        center={center}
        pins={pins}
        selectedId={hoverId}
        onSelect={(id) => navigate(`/station/${encodeURIComponent(id)}`)}
        onMoved={(c, byUser) => byUser && setMapCenter(c)}
        user={gps}
        fitKey={fitKey}
        radiusKm={settings.radiusKm}
      />

      <div className="radar-top">
        <PlaceSearch
          value={settings.locationLabel}
          near={center}
          onPick={(p) => {
            settings.set({ location: p, locationLabel: p.label });
            setMapCenter(null);
            void load(p).then(() => setFitKey((k) => k + 1));
          }}
          onLocate={() => void locate().then((p) => p && setFitKey((k) => k + 1))}
          locating={locating}
        />
        <div className="radar-chips">
          <FuelSwitch />
        </div>
      </div>

      {movedAway && mapCenter && (
        <button
          className="search-here"
          onClick={() => {
            settings.set({ location: mapCenter, locationLabel: `${formatNum(mapCenter.lat, lang, 3)}, ${formatNum(mapCenter.lng, lang, 3)}` });
            void load(mapCenter);
            setMapCenter(null);
          }}
        >
          <Icon name="refresh" size={16} /> {t('radar.searchHere')}
        </button>
      )}

      <Sheet state={sheet} onState={setSheet} header={header}>
        <InstallHint />
        {isDemo && (
          <div className="banner banner-info">
            <Icon name="info" size={18} />
            <span>{t('radar.demoBanner')}</span>
            <Link to="/settings" className="btn btn-s">
              {t('radar.demoAction')}
            </Link>
          </div>
        )}

        {error ? (
          <div className="banner banner-error">
            <Icon name="alert" size={18} />
            <span>{error === 'missingKey' || error === 'missingServer' ? t(`error.${error}`) : t('error.generic', { msg: error })}</span>
            {error === 'missingKey' || error === 'missingServer' ? (
              <Link to="/settings" className="btn btn-s">
                {t('error.openSettings')}
              </Link>
            ) : (
              <button className="btn btn-s" onClick={() => void load()}>
                {t('common.retry')}
              </button>
            )}
          </div>
        ) : null}

        {view.summary && (
          <div className="kpis">
            <Stat label={t('radar.cheapest')} value={<PriceTag price={view.summary.min} level="cheap" size="l" />} sub={cheapest?.brand || cheapest?.name} tone="cheap" />
            <Stat label={t('radar.average')} value={<PriceTag price={view.summary.mean} size="l" />} sub={t('radar.stations', { n: view.summary.n })} />
            <Stat label={t('radar.spread')} value={`${formatNum((view.summary.max - view.summary.min) * 100, lang, 0)} ct`} sub={`${formatNum(view.summary.min, lang, 2)}–${formatNum(view.summary.max, lang, 2)} €`} />
          </div>
        )}

        {view.summary && (
          <Link to="/stats" className={`tip ${tip.saving >= 0.01 ? 'tip-wait' : 'tip-now'}`}>
            <Icon name={tip.saving >= 0.01 ? 'clock' : 'check'} size={20} />
            <span>
              <strong>{tip.saving >= 0.01 ? t('radar.tipLater', { time: formatTime(tip.at, lang), ct: formatNum(tip.saving * 100, lang, 0) }) : t('radar.tipNow')}</strong>
              <span className="muted small">
                {profile.days > 0 ? t('radar.tipBasis.own', { days: profile.days }) : t('radar.tipBasis.default')}
              </span>
            </span>
            <Icon name="next" size={18} className="muted" />
          </Link>
        )}

        <div className="list-controls">
          <Segmented
            size="s"
            value={settings.sort}
            onChange={(sort) => settings.set({ sort })}
            options={[
              { value: 'price', label: t('radar.sortPrice') },
              { value: 'dist', label: t('radar.sortDist') },
            ]}
          />
          <label className="select-inline">
            <span className="sr-only">{t('radar.radius')}</span>
            <select value={settings.radiusKm} onChange={(e) => settings.set({ radiusKm: Number(e.target.value) })} aria-label={t('radar.radius')}>
              {[1, 2, 3, 5, 10, 15, 25].map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </label>
          <Toggle checked={settings.onlyOpen} onChange={(onlyOpen) => settings.set({ onlyOpen })} label={t('radar.onlyOpen')} />
          <span className="muted small grow-right">
            {loading ? <Spinner size={14} /> : fetchedAt ? formatAgo(fetchedAt, lang) : ''}
            <button className="icon-btn icon-btn-s" onClick={() => void load()} aria-label="Refresh" title="Refresh">
              <Icon name="refresh" size={16} />
            </button>
          </span>
        </div>

        {!loading && !error && view.list.length === 0 && center && (
          <Empty icon="search" action={settings.radiusKm < 25 && <button className="btn" onClick={() => settings.set({ radiusKm: Math.min(25, settings.radiusKm * 2) })}>{t('radar.increaseRadius')}</button>}>
            {t('radar.noStations')}
          </Empty>
        )}

        <div className="station-list" role="list">
          {view.list.map((s, i) => (
            <StationRow
              key={s.id}
              station={s}
              fuel={view.fuel}
              level={view.levelOf(s)}
              avg={view.summary?.mean}
              selected={hoverId === s.id}
              onHover={setHoverId}
              rank={settings.sort === 'price' && s.isOpen !== false ? i : undefined}
              favorite={!!favorites[s.id]}
            />
          ))}
        </div>
        <Attribution />
      </Sheet>
    </div>
  );
}
