import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Attribution } from '../components/Attribution';
import { BarChart, HBars, LineChart } from '../components/charts';
import { Card, Empty, PriceTag, Stat } from '../components/ui';
import { useAreaProfile } from '../hooks/useAreaProfile';
import { useStationsView } from '../hooks/useStationsView';
import { formatCt, formatDate, formatNum, formatPricePlain } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { DAY, dailyAggregates, rankHours, startOfDay } from '../lib/history';
import { histogram, mean, priceLevel } from '../lib/stats';
import { getProvider } from '../providers';
import { areaSnapshots, loadHistory } from '../services/historyStore';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { FuelSwitch } from './Radar';

export function Stats() {
  const t = useT();
  const lang = useLang();
  const view = useStationsView();
  const center = useData((s) => s.center);
  const { radiusKm, locationLabel } = useSettings();
  const profile = useAreaProfile(view.list, view.fuel);
  const [trend, setTrend] = useState<{ t: number; p: number }[] | null>(null);
  const { summary, fuel } = view;
  const open = view.list.filter((s) => s.isOpen !== false && s.prices[fuel] != null);

  // Area trend: daily averages over 30 days
  const trendKey = `${fuel}|${open.slice(0, 15).map((s) => s.id).join(',')}`;
  useEffect(() => {
    if (!center || !open.length) return;
    let cancelled = false;
    (async () => {
      const now = Date.now();
      const from = startOfDay(now - 30 * DAY);
      const provider = getProvider();
      let points: { t: number; p: number }[] = [];
      if (provider.history) {
        const hs = await Promise.all(open.slice(0, 15).map((s) => loadHistory(provider, s.id, fuel, from, now)));
        const byDay = new Map<number, number[]>();
        for (const h of hs) for (const d of dailyAggregates(h, from, now)) byDay.set(d.day, [...(byDay.get(d.day) ?? []), d.avg]);
        points = [...byDay.entries()].filter(([, v]) => v.length >= 3).map(([day, v]) => ({ t: day + DAY / 2, p: mean(v) }));
      } else {
        const snaps = await areaSnapshots(center, fuel, from);
        const byDay = new Map<number, number[]>();
        for (const s of snaps) {
          const d = startOfDay(s.t);
          byDay.set(d, [...(byDay.get(d) ?? []), s.mean]);
        }
        points = [...byDay.entries()].map(([day, v]) => ({ t: day + DAY / 2, p: mean(v) }));
      }
      points.sort((a, b) => a.t - b.t);
      if (!cancelled) setTrend(points);
    })().catch(() => !cancelled && setTrend([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendKey, center]);

  const bins = useMemo(() => histogram(open.map((s) => s.prices[fuel]!), 0.02), [open, fuel]);
  const brands = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of open) {
      const b = s.brand || t('stats.otherBrand');
      m.set(b, [...(m.get(b) ?? []), s.prices[fuel]!]);
    }
    return [...m.entries()]
      .filter(([, v]) => v.length >= 2)
      .map(([b, v]) => ({ brand: b, avg: mean(v), n: v.length }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 12);
  }, [open, fuel, t]);

  if (!summary) {
    return (
      <div className="page">
        <h1>{t('stats.title')}</h1>
        <Empty icon="chart" action={<Link className="btn" to="/">{t('nav.radar')}</Link>}>
          {t('stats.noData')}
        </Empty>
      </div>
    );
  }

  const ranked = rankHours(profile);
  const nowHour = new Date().getHours();
  const now = Date.now();

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t('stats.title')}</h1>
          <p className="muted">{t('stats.area', { r: radiusKm, place: locationLabel || '…' })}</p>
        </div>
        <FuelSwitch />
      </header>

      <div className="kpis kpis-5">
        <Stat label={t('radar.cheapest')} value={<PriceTag price={summary.min} size="l" level="cheap" />} tone="cheap" />
        <Stat label={t('radar.average')} value={<PriceTag price={summary.mean} size="l" />} />
        <Stat label={t('stats.median')} value={<PriceTag price={summary.median} size="l" />} />
        <Stat label={t('station.max')} value={<PriceTag price={summary.max} size="l" level="expensive" />} tone="expensive" />
        <Stat label={t('radar.stations', { n: '' }).trim()} value={String(summary.n)} sub={t('stats.open')} />
      </div>

      <div className="grid-2">
        <Card title={t('stats.distribution')} hint={t('stats.distributionHint')}>
          <BarChart
            ariaLabel={t('stats.distribution')}
            height={190}
            labelEvery={Math.max(1, Math.ceil(bins.length / 7))}
            formatY={(v) => String(Math.round(v))}
            data={bins.map((b) => ({
              key: b.from,
              label: formatNum(b.from, lang, 2),
              value: b.count,
              tone: priceLevel(b.from + 0.01, summary),
              tip: (
                <>
                  <strong>
                    {formatNum(b.from, lang, 2)}–{formatNum(b.to, lang, 2)} €
                  </strong>
                  <br />
                  {b.count} × {t('stats.station')}
                </>
              ),
            }))}
          />
        </Card>

        <Card title={t('stats.hours')} hint={profile.days > 0 ? t('radar.tipBasis.own', { days: profile.days }) : t('radar.tipBasis.default')}>
          <BarChart
            ariaLabel={t('stats.hours')}
            height={190}
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
                  <strong>{h}:00</strong>
                  <br />
                  {formatCt(d, lang)}
                </>
              ),
            }))}
          />
          <p className="small">
            {t('station.cheapestHours', {
              hours: ranked
                .slice(0, 3)
                .map((r) => r.hour)
                .sort((a, b) => a - b)
                .map((h) => `${h}–${h + 1}`)
                .join(', ') + (lang === 'de' ? ' Uhr' : ' h'),
            })}
          </p>
        </Card>
      </div>

      <div className="grid-2">
        <Card title={t('stats.trend')} hint={t('stats.trendHint')}>
          {trend == null ? (
            <div className="chart-skeleton" />
          ) : trend.length < 2 ? (
            <Empty icon="chart">{t('stats.trendEmpty')}</Empty>
          ) : (
            <LineChart
              ariaLabel={t('stats.trend')}
              points={trend}
              step={false}
              from={trend[0].t - DAY / 2}
              to={now}
              formatX={(x) => formatDate(x, lang, { day: '2-digit', month: '2-digit' })}
              formatY={(v) => formatNum(v, lang, 2)}
              formatTip={(pt) => (
                <>
                  <strong>{formatPricePlain(pt.p, lang)}</strong>
                  <br />
                  {formatDate(pt.t, lang)}
                </>
              )}
            />
          )}
        </Card>

        <Card title={t('stats.brands')} hint={t('stats.brandsHint')}>
          {brands.length ? (
            <HBars
              format={(v) => formatPricePlain(v, lang)}
              data={brands.map((b) => ({ key: b.brand, label: b.brand, sub: `(${b.n})`, value: b.avg, tone: priceLevel(b.avg, summary) }))}
            />
          ) : (
            <Empty icon="chart">{t('stats.noData')}</Empty>
          )}
        </Card>
      </div>

      <Card title={`Top 10 – ${t(`fuel.${fuel}`)}`}>
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('stats.station')}</th>
              <th className="num">km</th>
              <th className="num">{t('stats.price')}</th>
            </tr>
          </thead>
          <tbody>
            {[...open]
              .sort((a, b) => a.prices[fuel]! - b.prices[fuel]!)
              .slice(0, 10)
              .map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td>
                    <Link to={`/station/${encodeURIComponent(s.id)}`}>{s.name}</Link>
                    <span className="muted small"> · {s.place}</span>
                  </td>
                  <td className="num">{s.dist != null ? formatNum(s.dist, lang, 1) : '–'}</td>
                  <td className="num">
                    <PriceTag price={s.prices[fuel]} size="s" />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Card>
      <Attribution />
    </div>
  );
}
