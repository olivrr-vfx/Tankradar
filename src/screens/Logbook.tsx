import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart } from '../components/charts';
import { Icon } from '../components/Icon';
import { Card, Empty, Field, Modal, NumberInput, Segmented, Stat } from '../components/ui';
import { formatDate, formatEUR, formatNum, formatPricePlain } from '../i18n/format';
import { useLang, useT } from '../i18n';
import type { FuelType } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { saveTextFile } from '../services/platform';
import { uid, useUser, type LogEntry } from '../store/user';

export interface LogStats {
  spent: number;
  liters: number;
  avgPrice: number;
  consumption: number | null;
  costPer100: number | null;
}

/** Consumption via the full-tank method: litres between two full fills / km driven. */
export function logStats(entries: LogEntry[]): LogStats {
  const spent = entries.reduce((a, e) => a + e.liters * e.pricePerL, 0);
  const liters = entries.reduce((a, e) => a + e.liters, 0);
  const sorted = [...entries].filter((e) => e.odometer != null).sort((a, b) => a.odometer! - b.odometer!);
  let litersSince = 0;
  let firstFull: number | null = null;
  let totalL = 0;
  let totalKm = 0;
  let lastFull: number | null = null;
  for (const e of sorted) {
    if (firstFull == null) {
      if (e.full) firstFull = lastFull = e.odometer!;
      continue;
    }
    litersSince += e.liters;
    if (e.full) {
      totalL += litersSince;
      totalKm += e.odometer! - lastFull!;
      lastFull = e.odometer!;
      litersSince = 0;
    }
  }
  const consumption = totalKm > 0 ? (totalL / totalKm) * 100 : null;
  const avgPrice = liters > 0 ? spent / liters : 0;
  return { spent, liters, avgPrice, consumption, costPer100: consumption != null ? consumption * avgPrice : null };
}

export function Logbook() {
  const t = useT();
  const lang = useLang();
  const { log, vehicles, activeVehicleId, saveLog, removeLog } = useUser();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [vehicleId, setVehicleId] = useState(activeVehicleId);
  const entries = log.filter((e) => e.vehicleId === vehicleId);
  const stats = useMemo(() => logStats(entries), [entries]);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? vehicles[0];

  useEffect(() => {
    const station = params.get('station');
    if (station) {
      setEditing({
        id: uid(),
        date: Date.now(),
        vehicleId: vehicle.id,
        stationName: station,
        fuel: (params.get('fuel') as FuelType) || vehicle.fuel,
        liters: Math.round(vehicle.tankL * 0.7),
        pricePerL: Number(params.get('price')) || 1.799,
        odometer: null,
        full: true,
        note: '',
      });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = useMemo(() => {
    const m = new Map<string, number>();
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      m.set(`${d.getFullYear()}-${d.getMonth()}`, 0);
    }
    for (const e of entries) {
      const d = new Date(e.date);
      const k = `${d.getFullYear()}-${d.getMonth()}`;
      if (m.has(k)) m.set(k, m.get(k)! + e.liters * e.pricePerL);
    }
    return [...m.entries()].map(([k, v]) => {
      const [y, mo] = k.split('-').map(Number);
      return { key: k, label: new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-GB', { month: 'short' }).format(new Date(y, mo, 1)), value: v };
    });
  }, [entries, lang]);

  const newEntry = (): LogEntry => ({
    id: uid(),
    date: Date.now(),
    vehicleId: vehicle.id,
    stationName: '',
    fuel: vehicle.fuel,
    liters: Math.round(vehicle.tankL * 0.7),
    pricePerL: entries[0]?.pricePerL ?? 1.799,
    odometer: entries[0]?.odometer != null ? entries[0].odometer + 500 : null,
    full: true,
    note: '',
  });

  const exportCsv = () => {
    const head = 'date;vehicle;station;fuel;liters;price_per_l;total;odometer;full;note';
    const rows = log.map((e) =>
      [new Date(e.date).toISOString(), vehicles.find((v) => v.id === e.vehicleId)?.name ?? '', e.stationName, e.fuel, e.liters, e.pricePerL, (e.liters * e.pricePerL).toFixed(2), e.odometer ?? '', e.full ? 1 : 0, e.note]
        .map((x) => `"${String(x).replace(/"/g, '""')}"`)
        .join(';'),
    );
    void saveTextFile('tankradar-tankbuch.csv', [head, ...rows].join('\n'), 'text/csv');
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>{t('log.title')}</h1>
        <div className="row gap-s">
          {log.length > 0 && (
            <button className="btn btn-s" onClick={exportCsv}>
              <Icon name="download" size={16} /> {t('log.export')}
            </button>
          )}
          <button className="btn btn-s btn-primary" onClick={() => setEditing(newEntry())}>
            <Icon name="plus" size={16} /> {t('log.add')}
          </button>
        </div>
      </header>

      {vehicles.length > 1 && <Segmented value={vehicleId} onChange={setVehicleId} options={vehicles.map((v) => ({ value: v.id, label: v.name }))} />}

      {entries.length === 0 ? (
        <Empty icon="book" action={<button className="btn btn-primary" onClick={() => setEditing(newEntry())}>{t('log.add')}</button>}>
          {t('log.empty')}
        </Empty>
      ) : (
        <>
          <div className="kpis">
            <Stat label={t('log.totalSpent')} value={formatEUR(stats.spent, lang, 0)} tone="brand" />
            <Stat label={t('log.totalLiters')} value={`${formatNum(stats.liters, lang, 0)} l`} />
            <Stat label={t('log.avgPrice')} value={formatPricePlain(stats.avgPrice, lang)} />
            <Stat label={t('log.avgConsumption')} value={stats.consumption != null ? `${formatNum(stats.consumption, lang, 1)} l` : '–'} sub="/100 km" />
            <Stat label={t('log.costPerKm')} value={stats.costPer100 != null ? formatEUR(stats.costPer100, lang) : '–'} />
          </div>
          <Card title={t('log.monthly')}>
            <BarChart ariaLabel={t('log.monthly')} height={160} formatY={(v) => formatEUR(v, lang, 0)} data={months.map((m) => ({ key: m.key, label: m.label, value: m.value }))} />
          </Card>
          <Card>
            <div className="table-wrap"><table className="table">
              <thead>
                <tr>
                  <th>{t('log.date')}</th>
                  <th>{t('log.station')}</th>
                  <th className="num">l</th>
                  <th className="num">€/l</th>
                  <th className="num">€</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date, lang)}</td>
                    <td>
                      {e.stationName || '–'}
                      <span className="muted small">
                        {' '}
                        · {t(`fuel.short.${e.fuel}`)}
                        {e.odometer != null && ` · ${formatNum(e.odometer, lang, 0)} km`}
                        {e.full && ' · ⛽'}
                      </span>
                    </td>
                    <td className="num">{formatNum(e.liters, lang, 1)}</td>
                    <td className="num">{formatNum(e.pricePerL, lang, 3)}</td>
                    <td className="num">{formatNum(e.liters * e.pricePerL, lang, 2)}</td>
                    <td className="num nowrap">
                      <button className="icon-btn icon-btn-s" aria-label={t('common.edit')} onClick={() => setEditing(e)}>
                        <Icon name="edit" size={15} />
                      </button>
                      <button className="icon-btn icon-btn-s" aria-label={t('common.delete')} onClick={() => removeLog(e.id)}>
                        <Icon name="trash" size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('log.add')}>
        {editing && (
          <form
            className="form"
            onSubmit={(ev) => {
              ev.preventDefault();
              saveLog(editing);
              setEditing(null);
            }}
          >
            <div className="form-grid">
              <Field label={t('log.date')}>
                <input type="date" value={new Date(editing.date - new Date(editing.date).getTimezoneOffset() * 60000).toISOString().slice(0, 10)} onChange={(e) => e.target.value && setEditing({ ...editing, date: new Date(e.target.value + 'T12:00').getTime() })} />
              </Field>
              <Field label={t('log.station')}>
                <input value={editing.stationName} onChange={(e) => setEditing({ ...editing, stationName: e.target.value })} />
              </Field>
              <Field label={t('calc.liters')}>
                <NumberInput value={editing.liters} onChange={(liters) => setEditing({ ...editing, liters })} step={1} min={0} suffix="l" />
              </Field>
              <Field label={t('calc.price')}>
                <NumberInput value={editing.pricePerL} onChange={(pricePerL) => setEditing({ ...editing, pricePerL })} step={0.01} min={0} suffix="€/l" />
              </Field>
              <Field label={t('log.odometer')}>
                <NumberInput value={editing.odometer ?? NaN} onChange={(odometer) => setEditing({ ...editing, odometer })} step={100} min={0} suffix="km" />
              </Field>
              <Field label={t('settings.defaultFuel')}>
                <select value={editing.fuel} onChange={(e) => setEditing({ ...editing, fuel: e.target.value as FuelType })}>
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {t(`fuel.${f}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={editing.full} onChange={(e) => setEditing({ ...editing, full: e.target.checked })} /> {t('log.full')}
            </label>
            <Field label={t('log.note')}>
              <input value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
            </Field>
            <p className="total-line">
              {t('calc.total')}: <strong>{formatEUR(editing.liters * editing.pricePerL, lang)}</strong>
            </p>
            <div className="row-end">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
              <button className="btn btn-primary" type="submit">
                {t('common.save')}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
