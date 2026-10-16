import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Attribution } from '../components/Attribution';
import { BarChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { MapView, type MapPin } from '../components/MapView';
import { PlaceSearch } from '../components/PlaceSearch';
import { Card, Empty, Field, PriceTag, Spinner, Stat, toast } from '../components/ui';
import { RadarLoader } from '../components/motion';
import { haptic } from '../services/haptics';
import { useIsDark } from '../hooks/useTheme';
import { formatCt, formatDateTime, formatDuration, formatEUR, formatKm, formatNum, formatPricePlain, formatTime } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { buildGpx, buildIcs, navUrl } from '../lib/deeplinks';
import { priceLevel, summarize } from '../lib/stats';
import { getProvider } from '../providers';
import { getPosition, openExternal, saveTextFile } from '../services/platform';
import { planTrip, predictedAt, type TripResult } from '../services/tripPlanner';
import { useData } from '../store/data';
import { useRoute } from '../store/route';
import { useSettings } from '../store/settings';
import { useUser } from '../store/user';

const toLocalInput = (t: number) => {
  const d = new Date(t - new Date(t).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};

export function RoutePlanner() {
  const t = useT();
  const lang = useLang();
  const dark = useIsDark();
  const r = useRoute();
  const { fuel: settingsFuel, routerUrl } = useSettings();
  const { vehicles, activeVehicleId } = useUser();
  const vehicle = vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];
  const gps = useData((s) => s.gps);
  const [departure, setDeparture] = useState(() => Math.ceil(Date.now() / 300000) * 300000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [showForm, setShowForm] = useState(!r.result);
  const fuel = vehicle.fuel ?? settingsFuel;
  const res = r.result;

  const run = async () => {
    let from = r.from;
    if (!from || from.label === t('route.myLocation')) {
      try {
        const p = gps ?? (await getPosition());
        from = { ...p, label: t('route.myLocation') };
        r.set({ from });
      } catch {
        if (!from) {
          toast(t('error.location'));
          return;
        }
      }
    }
    if (!from || !r.to) return;
    setError(null);
    setBusy(t('route.planning'));
    try {
      const provider = getProvider();
      const result = await planTrip(
        provider,
        {
          from,
          to: r.to,
          departure,
          vehicle,
          fuel,
          startFuelL: (vehicle.tankL * r.fuelPct) / 100,
          reserveL: Math.max(3, vehicle.tankL * 0.1),
          endFuelL: (vehicle.tankL * r.endFuelPct) / 100,
          corridorKm: r.corridorKm,
          stopPenalty: r.stopPenalty,
          routerUrl,
        },
        (phase, done, total) => setBusy(phase === 'route' ? t('route.planning') : t('route.searchingStations', { done: done ?? 0, total: total ?? 0 })),
      );
      r.set({ result: result });
      void haptic('success');
      setFitKey((k) => k + 1);
      setShowForm(false);
      if (result.fallbackRoute) toast(t('route.offlineFallback'));
    } catch (e) {
      setError(e instanceof Error ? (e.message === 'missingKey' || e.message === 'missingServer' ? t(`error.${e.message}`) : e.message) : String(e));
    } finally {
      setBusy(null);
    }
  };

  const predicted = useMemo(() => {
    if (!res) return [];
    return res.stations
      .map((rs) => ({ rs, price: predictedAt(rs, res.input.fuel, res.input.departure, res.profile) }))
      .filter((x): x is { rs: typeof x.rs; price: number } => x.price != null);
  }, [res]);
  const summary = useMemo(() => summarize(predicted.map((p) => p.price)), [predicted]);
  const stopIds = new Map(res?.plan.stops.map((s, i) => [s.candidate.ref.station.id, i + 1]) ?? []);

  const pins: MapPin[] = useMemo(() => {
    const top = new Set([...predicted].sort((a, b) => a.price - b.price).slice(0, 8).map((x) => x.rs.station.id));
    return predicted.map(({ rs, price }) => ({
        id: rs.station.id,
        lat: rs.station.lat,
        lng: rs.station.lng,
        price,
        level: priceLevel(price, summary),
        title: rs.station.name,
        brand: rs.station.brand,
        badge: stopIds.has(rs.station.id) ? String(stopIds.get(rs.station.id)) : undefined,
        minor: !stopIds.has(rs.station.id) && !top.has(rs.station.id),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predicted, summary, res]);

  return (
    <div className="split">
      <div className="split-map">
        <MapView dark={dark} center={r.from ?? gps} pins={pins} route={res?.route.coords ?? null} fitKey={fitKey} user={gps} onSelect={(id) => (window.location.hash = `#/station/${encodeURIComponent(id)}`)} selectedId={null} />
      </div>
      <div className="split-panel">
        <h1 className="panel-title">
          <Icon name="route" /> {t('route.title')}
        </h1>

        {(showForm || !res) ? (
          <RouteForm departure={departure} setDeparture={setDeparture} onRun={run} busy={!!busy} />
        ) : (
          <button className="route-summary-bar" onClick={() => setShowForm(true)}>
            <span>
              <strong>{r.from?.label}</strong> → <strong>{r.to?.label}</strong>
              <span className="muted small"> · {formatDateTime(res.input.departure, lang)}</span>
            </span>
            <Icon name="edit" size={16} />
          </button>
        )}

        {busy && (
          <div className="planning">
            <RadarLoader size={64} />
            <strong>{busy}</strong>
          </div>
        )}
        {error && (
          <div className="banner banner-error">
            <Icon name="alert" size={18} /> {t('route.error', { msg: error })}
            {/missing/.test(error) || error === t('error.missingKey') ? (
              <Link className="btn btn-s" to="/settings">
                {t('error.openSettings')}
              </Link>
            ) : null}
          </div>
        )}

        {!res && !busy && <Empty icon="route">{t('route.empty')}</Empty>}
        {res && !busy && <TripResultView res={res} summary={summary} predicted={predicted} />}
        <Attribution />
      </div>
    </div>
  );
}

function RouteForm({ departure, setDeparture, onRun, busy }: { departure: number; setDeparture: (t: number) => void; onRun: () => void; busy: boolean }) {
  const t = useT();
  const r = useRoute();
  const gps = useData((s) => s.gps);
  const center = useData((s) => s.center);
  const { vehicles, activeVehicleId, setActiveVehicle } = useUser();
  const vehicle = vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];
  const lang = useLang();
  return (
    <form
      className="form route-form"
      onSubmit={(e) => {
        e.preventDefault();
        onRun();
      }}
    >
      <div className="route-points">
        <div className="route-point">
          <span className="route-dot dot-a">A</span>
          <PlaceSearch
            value={r.from?.label ?? t('route.myLocation')}
            placeholder={t('route.from')}
            near={gps ?? center}
            onPick={(p) => r.set({ from: { lat: p.lat, lng: p.lng, label: p.label } })}
            onLocate={async () => {
              try {
                const p = gps ?? (await getPosition());
                r.set({ from: { ...p, label: t('route.myLocation') } });
              } catch {
                toast(t('error.location'));
              }
            }}
          />
        </div>
        <button type="button" className="icon-btn swap-btn" aria-label={t('route.swap')} title={t('route.swap')} onClick={() => r.set({ from: r.to, to: r.from })}>
          <Icon name="swap" size={18} />
        </button>
        <div className="route-point">
          <span className="route-dot dot-b">B</span>
          <PlaceSearch value={r.to?.label ?? ''} placeholder={t('route.to')} near={gps ?? center} onPick={(p) => r.set({ to: { lat: p.lat, lng: p.lng, label: p.label } })} />
        </div>
      </div>

      <div className="form-grid">
        <Field label={t('route.departure')}>
          <input type="datetime-local" value={toLocalInput(departure)} onChange={(e) => e.target.value && setDeparture(new Date(e.target.value).getTime())} />
        </Field>
        <Field label={t('route.vehicle')}>
          <select value={vehicle.id} onChange={(e) => setActiveVehicle(e.target.value)}>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {t(`fuel.short.${v.fuel}`)} · {v.tankL} l · {formatNum(v.consumption, lang, 1)} l/100
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={`${t('route.fuelLevel')}: ${r.fuelPct} % (≈ ${Math.round((vehicle.tankL * r.fuelPct) / 100)} l · ${Math.round(((vehicle.tankL * r.fuelPct) / 100 / vehicle.consumption) * 100)} km)`}>
        <input type="range" min={5} max={100} step={5} value={r.fuelPct} onChange={(e) => r.set({ fuelPct: Number(e.target.value) })} />
      </Field>

      <details className="advanced">
        <summary>{t('common.more')}</summary>
        <div className="form-grid">
          <Field label={t('route.corridor')}>
            <select value={r.corridorKm} onChange={(e) => r.set({ corridorKm: Number(e.target.value) })}>
              {[1, 2, 3, 5, 8, 10].map((k) => (
                <option key={k} value={k}>
                  {k} km
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('route.stopPenalty')}>
            <select value={r.stopPenalty} onChange={(e) => r.set({ stopPenalty: Number(e.target.value) })}>
              {[0, 1, 2, 3, 5, 10].map((k) => (
                <option key={k} value={k}>
                  {formatEUR(k, lang, 0)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('route.endFuel')}>
            <select value={r.endFuelPct} onChange={(e) => r.set({ endFuelPct: Number(e.target.value) })}>
              {[0, 25, 50, 75, 100].map((k) => (
                <option key={k} value={k}>
                  {k} %
                </option>
              ))}
            </select>
          </Field>
        </div>
      </details>

      <button className="btn btn-primary btn-l btn-block" type="submit" disabled={busy || !r.to}>
        {busy ? <Spinner size={16} /> : <Icon name="route" size={18} />} {t('route.plan')}
      </button>
    </form>
  );
}

function TripResultView({ res, summary, predicted }: { res: TripResult; summary: ReturnType<typeof summarize>; predicted: { rs: TripResult['stations'][number]; price: number }[] }) {
  const t = useT();
  const lang = useLang();
  const { plan, route, input } = res;
  const arrival = input.departure + route.durationSec * 1000;
  const avgPaid = plan.liters > 0 ? plan.fuelCost / plan.liters : 0;
  const saving = plan.liters > 0 && summary ? (summary.mean - avgPaid) * plan.liters : 0;
  const best = res.departures.filter((d) => d.feasible).reduce((a, b) => (b.objective < a.objective - 0.01 ? b : a), res.departures[0]);
  const minObj = Math.min(...res.departures.filter((d) => d.feasible).map((d) => d.objective));
  const firstStop = plan.stops[0]?.candidate.ref.station;
  const deeplinkStops = plan.stops.map((s) => s.candidate.ref.station);

  return (
    <div className="trip">
      <div className="kpis">
        <Stat label={t('route.distance')} value={formatKm(route.distanceKm, lang)} sub={formatDuration(route.durationSec, lang)} />
        <Stat label={t('route.arrivalLabel')} value={formatTime(arrival, lang)} sub={formatDateTime(arrival, lang).split(',')[0]} />
        <Stat label={t('route.fuelCost')} value={formatEUR(plan.fuelCost, lang)} sub={plan.liters ? `${formatNum(plan.liters, lang, 0)} l · Ø ${formatPricePlain(avgPaid, lang)}` : undefined} tone="brand" />
        {saving > 0.05 && <Stat label={t('route.saving')} value={formatEUR(saving, lang)} tone="cheap" />}
      </div>

      <h2 className="section-title">{t('route.stops')}</h2>
      {!plan.feasible ? (
        <div className="banner banner-error">
          <Icon name="alert" size={18} /> {t('route.infeasible')}
        </div>
      ) : plan.stops.length === 0 ? (
        <div className="banner banner-info">
          <Icon name="check" size={18} /> {t('route.noStopNeeded')}
        </div>
      ) : (
        <ol className="stops">
          {plan.stops.map((s, i) => {
            const st = s.candidate.ref.station;
            const eta = input.departure + s.candidate.ref.etaOffsetSec * 1000;
            return (
              <li key={st.id} className="stop" style={{ animationDelay: `${i * 90}ms` }}>
                <span className="stop-num">{i + 1}</span>
                <div className="stop-body">
                  <Link to={`/station/${encodeURIComponent(st.id)}`} className="stop-name">
                    {st.name}
                  </Link>
                  <span className="muted small">
                    {t('route.stopEta', { time: formatTime(eta, lang), km: formatNum(s.candidate.alongKm, lang, 0) })} · {t('route.detour', { km: formatNum(s.candidate.detourKm, lang, 1) })}
                  </span>
                  <span className="small">
                    {t('route.liters', { l: formatNum(s.liters, lang, 0) })} · <strong>{formatEUR(s.cost, lang)}</strong> ·{' '}
                    <span className="muted">
                      {t('route.expected', { price: formatPricePlain(s.candidate.price, lang) })}
                      {Number.isFinite(s.candidate.ref.station.prices[input.fuel] ?? NaN) && ` (${lang === 'de' ? 'jetzt' : 'now'} ${formatPricePlain(s.candidate.ref.station.prices[input.fuel], lang)})`}
                    </span>
                  </span>
                </div>
                <div className="stop-actions">
                  <PriceTag price={s.candidate.price} level={priceLevel(s.candidate.price, summary)} size="l" />
                  <button
                    className="icon-btn"
                    title={t('route.ics')}
                    aria-label={t('route.ics')}
                    onClick={() =>
                      void saveTextFile(
                        `tankstopp-${i + 1}.ics`,
                        buildIcs(t('route.icsTitle', { name: st.name }), eta - 10 * 60000, `${st.street} ${st.houseNumber ?? ''}, ${st.postCode} ${st.place}`, `${t(`fuel.${input.fuel}`)} ~${formatPricePlain(s.candidate.price, lang)} · ${formatNum(s.liters, lang, 0)} l`),
                        'text/calendar',
                      )
                    }
                  >
                    <Icon name="calendar" size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <Card title={t('route.departureCompare')} hint={t('route.departureHint')}>
        <BarChart
          ariaLabel={t('route.departureCompare')}
          height={160}
          labelEvery={3}
          formatY={(v) => formatEUR(v, lang, 0)}
          data={res.departures.map((d, i) => ({
            key: d.departure,
            label: i === 0 ? (lang === 'de' ? 'jetzt' : 'now') : formatTime(d.departure, lang).slice(0, 2),
            value: d.feasible ? d.objective - minObj : 0,
            tone: d === best ? 'cheap' : 'brand',
            highlight: i === 0,
            tip: (
              <>
                <strong>{formatDateTime(d.departure, lang)}</strong>
                <br />+{formatEUR(d.objective - minObj, lang)}
              </>
            ),
          }))}
        />
        {best && best.departure !== res.departures[0].departure && res.departures[0].objective - best.objective > 0.3 && (
          <p className="small">
            <Icon name="clock" size={14} /> {t('route.bestDeparture', { time: formatDateTime(best.departure, lang), eur: formatEUR(res.departures[0].objective - best.objective, lang) })}
          </p>
        )}
      </Card>

      <Card title={t('route.export')}>
        <div className="export-grid">
          <button className="btn" onClick={() => void openExternal(navUrl('google', input.to, { origin: input.from, waypoints: deeplinkStops }))}>
            <Icon name="navigate" size={16} /> {t('route.openGoogle')}
          </button>
          <button className="btn" onClick={() => void openExternal(navUrl('apple', firstStop ?? input.to, { origin: input.from, name: firstStop?.name }))}>
            <Icon name="navigate" size={16} /> {t('route.openApple')}
          </button>
          <button className="btn" onClick={() => void openExternal(navUrl('waze', firstStop ?? input.to))}>
            <Icon name="navigate" size={16} /> {t('route.openWaze')}
          </button>
          <button className="btn" onClick={() => void openExternal(navUrl('osm', input.to, { origin: input.from, waypoints: deeplinkStops }))}>
            <Icon name="map" size={16} /> {t('route.openOsm')}
          </button>
          <button
            className="btn"
            onClick={() =>
              void saveTextFile(
                'tankradar-route.gpx',
                buildGpx(
                  `Tankradar ${useRoute.getState().from?.label ?? ''} → ${useRoute.getState().to?.label ?? ''}`,
                  route.coords,
                  plan.stops.map((s, i) => ({ lat: s.candidate.ref.station.lat, lng: s.candidate.ref.station.lng, name: `${i + 1}. ${s.candidate.ref.station.name}`, desc: `${formatNum(s.liters, lang, 0)} l · ~${formatPricePlain(s.candidate.price, lang)}` })),
                ),
                'application/gpx+xml',
              )
            }
          >
            <Icon name="download" size={16} /> {t('route.gpx')}
          </button>
        </div>
      </Card>

      <h2 className="section-title">
        {t('route.alongRoute')} <span className="muted small">({predicted.length})</span>
      </h2>
      <ul className="along-list">
        {[...predicted]
          .sort((a, b) => a.price - b.price)
          .slice(0, 20)
          .map(({ rs, price }) => (
            <li key={rs.station.id}>
              <Link to={`/station/${encodeURIComponent(rs.station.id)}`}>
                <span className="along-km">km {formatNum(rs.alongKm, lang, 0)}</span>
                <span className="along-name">
                  <span className="ellipsis">{rs.station.name}</span>
                  <span className="muted small ellipsis">
                    {formatTime(input.departure + rs.etaOffsetSec * 1000, lang)} · {t('route.detour', { km: formatNum(rs.detourKm, lang, 1) })}
                  </span>
                </span>
                <span className="along-price">
                  <PriceTag price={price} size="m" level={priceLevel(price, summary)} />
                  {summary && <span className={`delta ${price < summary.mean ? 'neg' : 'pos'}`}>{formatCt(price - summary.mean, lang)}</span>}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
