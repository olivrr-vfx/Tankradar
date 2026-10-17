import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertEditor } from '../components/AlertEditor';
import { StationHero } from '../components/StationHero';
import { brandMeta } from '../lib/brands';
import { haptic } from '../services/haptics';
import { Attribution } from '../components/Attribution';
import { BarChart, LineChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { startNavigation } from '../components/NavChooser';
import { Card, Empty, LevelBadge, OpenBadge, PriceTag, Segmented, Spinner, Stat, toast } from '../components/ui';
import { useAreaProfile } from '../hooks/useAreaProfile';
import { useStationsView } from '../hooks/useStationsView';
import { formatCt, formatDate, formatDateTime, formatEUR, formatNum, formatPricePlain, formatTime } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { DAY, dailyAggregates, hourlyProfile, rankHours, type HourProfile } from '../lib/history';
import { priceLevel } from '../lib/stats';
import type { FuelType, PricePoint, Station } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { getProvider } from '../providers';
import { cachedStation, loadHistory } from '../services/historyStore';
import { shareText } from '../services/platform';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useActiveVehicle, useUser } from '../store/user';

type Range = '24h' | '7d' | '30d' | '90d';
const RANGE_MS: Record<Range, number> = { '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY, '90d': 90 * DAY };

function useStation(id: string) {
  const fromList = useData((s) => s.stations.find((x) => x.id === id));
  const fav = useUser((s) => s.favorites[id]);
  const [station, setStation] = useState<Station | null>(fromList ?? fav ?? null);
  const [loading, setLoading] = useState(!station);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base = fromList ?? fav ?? (await cachedStation(id));
      if (base && !cancelled) setStation(base);
      try {
        const d = await getProvider().detail(id);
        if (d && !cancelled) setStation((prev) => ({ ...(prev ?? d), ...d, dist: prev?.dist ?? d.dist, prices: { ...prev?.prices, ...d.prices } }));
      } catch {
        /* keep what we have */
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return { station, loading };
}

export function StationDetail() {
  const { id = '' } = useParams();
  const t = useT();
  const lang = useLang();
  const { station, loading } = useStation(id);
  const fuelSetting = useSettings((s) => s.fuel);
  const [fuel, setFuel] = useState<FuelType>(fuelSetting);
  const [range, setRange] = useState<Range>('7d');
  const [history, setHistory] = useState<PricePoint[] | null>(null);
  const [long, setLong] = useState<PricePoint[] | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const view = useStationsView();
  const favorites = useUser((s) => s.favorites);
  const toggleFavorite = useUser((s) => s.toggleFavorite);
  const vehicle = useActiveVehicle();
  const areaProfile = useAreaProfile(view.list, fuel);
  const fuels = FUEL_TYPES.filter((f) => station?.prices[f] != null || station?.source !== 'econtrol');

  const now = useMemo(() => Date.now(), [id, range, fuel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    setHistory(null);
    loadHistory(getProvider(), id, fuel, now - RANGE_MS[range], now)
      .then((h) => !cancelled && setHistory(h))
      .catch(() => !cancelled && setHistory([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fuel, range, !!station]);

  // 28 days for the hour profile
  useEffect(() => {
    if (!station) return;
    let cancelled = false;
    loadHistory(getProvider(), id, fuel, now - 29 * DAY, now)
      .then((h) => !cancelled && setLong(h))
      .catch(() => !cancelled && setLong([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, fuel, !!station]);

  const ownProfile = useMemo(() => (long ? hourlyProfile(long, now, 28) : null), [long, now]);
  const profile: HourProfile = ownProfile ?? areaProfile;

  if (!station) {
    return (
      <div className="page">
        <BackBar />
        {loading ? (
          <div className="center-pad">
            <Spinner size={28} />
          </div>
        ) : (
          <Empty icon="alert">{t('station.notFound')}</Empty>
        )}
      </div>
    );
  }

  const price = station.prices[fuel] ?? null;
  const avg = view.summary?.mean;
  const isFav = !!favorites[station.id];
  const address = `${station.street} ${station.houseNumber ?? ''}`.trim();
  const fill = price != null ? price * vehicle.tankL : null;

  const from = now - RANGE_MS[range];
  const pts = history ?? [];
  const inRange = pts.filter((p) => p.t >= from);
  const values = pts.map((p) => p.p);
  const hMin = values.length ? Math.min(...values) : null;
  const hMax = values.length ? Math.max(...values) : null;
  const changesPerDay = inRange.length / (RANGE_MS[range] / DAY);
  const lastChange = pts.length ? pts[pts.length - 1].t : null;
  const daily = range === '30d' || range === '90d' ? dailyAggregates(pts, from, now) : null;

  const ranked = rankHours(profile);
  const cheapHours = ranked
    .slice(0, 3)
    .map((h) => h.hour)
    .sort((a, b) => a - b)
    .map((h) => `${h}–${h + 1}`)
    .join(', ');
  const nowHour = new Date().getHours();

  return (
    <div className="page station-page">
      <div className="hero-wrap">
      <StationHero station={station} fuel={fuel} />
      <BackBar
        floating
        actions={
          <>
            <button
              className="icon-btn"
              aria-label="share"
              title={t('common.share')}
              onClick={async () => {
                const ok = await shareText(
                  station.name,
                  `${station.name}, ${address}, ${station.postCode} ${station.place}\n${t(`fuel.${fuel}`)}: ${formatPricePlain(price, lang)}`,
                  `https://www.openstreetmap.org/?mlat=${station.lat}&mlon=${station.lng}#map=17/${station.lat}/${station.lng}`,
                );
                if (!ok) toast(t('common.copied'));
              }}
            >
              <Icon name="share" />
            </button>
            <button
              className={`icon-btn ${isFav ? 'is-fav pop' : ''}`}
              aria-pressed={isFav}
              title={isFav ? t('station.unfavorite') : t('station.favorite')}
              onClick={() => {
                void haptic(isFav ? 'light' : 'success');
                toggleFavorite(station);
              }}
            >
              <Icon name="star" filled={isFav} />
            </button>
          </>
        }
      />
      </div>

      <header className="station-head">
        <div className="station-title">
          <span className="eyebrow">{brandMeta(station.brand, station.name).name}</span>
          <h1>{station.name}</h1>
          <p className="muted">
            {address}, {station.postCode} {station.place}
          </p>
          <div className="row gap-s">
            <OpenBadge open={station.isOpen} />
            {station.dist != null && <span className="muted small">{formatNum(station.dist, lang, 1)} km</span>}
          </div>
        </div>
        <div className="station-cta">
          <button className="btn btn-primary btn-l" onClick={() => startNavigation({ dest: station, name: station.name })}>
            <Icon name="navigate" size={18} /> {t('common.navigate')}
          </button>
          <button className="btn" onClick={() => setAlertOpen(true)}>
            <Icon name="bell" size={18} /> {t('station.alert')}
          </button>
          <Link className="btn" to={`/logbook?station=${encodeURIComponent(station.name)}&price=${price ?? ''}&fuel=${fuel}`}>
            <Icon name="book" size={18} /> {t('log.add')}
          </Link>
        </div>
      </header>

      <div className="grid-2">
        <Card title={t('station.prices')}>
          <div className="fuel-prices">
            {fuels.map((f) => {
              const p = station.prices[f] ?? null;
              const lvl = f === view.fuel ? priceLevel(p ?? NaN, view.summary) : undefined;
              return (
                <button key={f} className={`fuel-price ${f === fuel ? 'active' : ''}`} onClick={() => setFuel(f)}>
                  <span className="muted small">{t(`fuel.${f}`)}</span>
                  <PriceTag price={p} size="xl" level={lvl} />
                  {lvl && <LevelBadge level={lvl} />}
                </button>
              );
            })}
          </div>
          {price != null && (
            <div className="kpis kpis-inline">
              <Stat label={t('station.fillUp', { l: vehicle.tankL })} value={fill != null ? formatEUR(fill, lang) : '–'} />
              {avg != null && fuel === view.fuel && (
                <Stat
                  label={t('station.diffAvg')}
                  value={formatEUR((avg - price) * vehicle.tankL, lang)}
                  sub={formatCt(price - avg, lang)}
                  tone={price < avg ? 'cheap' : 'expensive'}
                />
              )}
            </div>
          )}
        </Card>

        <Card title={t('station.bestTime')} hint={ownProfile ? t('station.bestTimeOwn', { days: ownProfile.days }) : t('station.bestTimeDefault')}>
          <BarChart
            ariaLabel={t('station.bestTime')}
            height={170}
            labelEvery={3}
            formatY={(v) => `${formatNum(v * 100, lang, 0)} ct`}
            data={profile.deltas.map((d, h) => ({
              key: h,
              label: String(h),
              value: d,
              tone: d < -0.005 ? 'cheap' : d > 0.005 ? 'expensive' : 'neutral',
              highlight: h === nowHour,
              tip: (
                <>
                  <strong>
                    {h}:00–{h + 1}:00
                  </strong>
                  <br />
                  {formatCt(d, lang)} {lang === 'de' ? 'ggü. Tagesmittel' : 'vs. daily mean'}
                </>
              ),
            }))}
          />
          <p className="small">
            <Icon name="clock" size={14} /> {t('station.cheapestHours', { hours: `${cheapHours} ${lang === 'de' ? 'Uhr' : 'h'}` })}
          </p>
        </Card>
      </div>

      <Card
        title={t('station.history')}
        action={
          <div className="row gap-s wrap">
            <Segmented size="s" value={fuel} onChange={setFuel} options={fuels.map((f) => ({ value: f, label: t(`fuel.short.${f}`) }))} />
            <Segmented
              size="s"
              value={range}
              onChange={setRange}
              options={(['24h', '7d', '30d', '90d'] as Range[]).map((r) => ({ value: r, label: t(`station.range.${r}`) }))}
            />
          </div>
        }
      >
        {history == null ? (
          <div className="chart-skeleton" />
        ) : inRange.length + (pts.length ? 1 : 0) < 2 ? (
          <Empty icon="chart">{t('station.noHistory')}</Empty>
        ) : (
          <>
            <LineChart
              ariaLabel={t('station.history')}
              points={daily ? daily.map((d) => ({ t: d.day + DAY / 2, p: d.avg })) : pts}
              band={daily?.map((d) => ({ t: d.day + DAY / 2, lo: d.min, hi: d.max }))}
              step={!daily}
              from={from}
              to={now}
              reference={avg != null && fuel === view.fuel ? { value: avg, label: `${t('station.areaAvg')} ${formatPricePlain(avg, lang)}` } : undefined}
              formatX={(x) => (range === '24h' ? formatTime(x, lang) : formatDate(x, lang, { day: '2-digit', month: '2-digit' }))}
              formatY={(v) => formatNum(v, lang, 2)}
              formatTip={(pt) => (
                <>
                  <strong>{formatPricePlain(pt.p, lang)}</strong>
                  <br />
                  {daily ? formatDate(pt.t, lang) : formatDateTime(pt.t, lang)}
                </>
              )}
            />
            <div className="kpis kpis-inline">
              <Stat label={t('station.min')} value={<PriceTag price={hMin} size="m" />} />
              <Stat label={t('station.max')} value={<PriceTag price={hMax} size="m" />} />
              <Stat label={t('station.changesPerDay')} value={formatNum(changesPerDay, lang, 1)} />
              {lastChange && <Stat label={t('station.lastChange')} value={formatTime(lastChange, lang)} sub={formatDate(lastChange, lang, { day: '2-digit', month: '2-digit' })} />}
            </div>
          </>
        )}
      </Card>

      <Card title={t('station.openingTimes')}>
        {station.wholeDay || (station.openingTimes && station.openingTimes.length === 0 && station.source === 'demo') ? (
          <p>{t('station.allDay')}</p>
        ) : station.openingTimes?.length ? (
          <table className="table">
            <tbody>
              {station.openingTimes.map((o, i) => (
                <tr key={i}>
                  <td>{o.text}</td>
                  <td className="num">
                    {o.start.slice(0, 5)} – {o.end.slice(0, 5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('common.unknown')}</p>
        )}
      </Card>
      <Attribution />

      <AlertEditor open={alertOpen} onClose={() => setAlertOpen(false)} stationId={station.id} stationName={station.name} suggested={price ?? undefined} />
    </div>
  );
}

export function BackBar({ actions, title, floating }: { actions?: React.ReactNode; title?: React.ReactNode; floating?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className={`back-bar ${floating ? 'floating' : ''}`}>
      <button className="icon-btn" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))} aria-label={t('common.back')}>
        <Icon name="back" />
      </button>
      {title && <h1 className="back-title">{title}</h1>}
      <span className="grow" />
      {actions}
    </div>
  );
}
