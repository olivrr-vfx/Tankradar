import { useState } from 'react';
import { Card, Field, NumberInput, Segmented, Stat } from '../components/ui';
import { useStationsView } from '../hooks/useStationsView';
import { formatEUR, formatNum } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { useActiveVehicle } from '../store/user';
import { Icon } from '../components/Icon';

type Tab = 'fill' | 'detour' | 'trip' | 'year';

export function Calculator() {
  const t = useT();
  const [tab, setTab] = useState<Tab>('fill');
  return (
    <div className="page page-narrow">
      <h1>{t('calc.title')}</h1>
      <div className="tabs-scroll">
        <Segmented
          value={tab}
          onChange={setTab}
          options={(['fill', 'detour', 'trip', 'year'] as Tab[]).map((x) => ({ value: x, label: t(`calc.tab.${x}`) }))}
        />
      </div>
      {tab === 'fill' && <FillCalc />}
      {tab === 'detour' && <DetourCalc />}
      {tab === 'trip' && <TripCalc />}
      {tab === 'year' && <YearCalc />}
    </div>
  );
}

function useCurrentPrices() {
  const view = useStationsView();
  return { min: view.summary?.min, mean: view.summary?.mean };
}

export function detourResult(near: number, far: number, liters: number, detourKm: number, consumption: number, minutes: number, eurPerHour: number) {
  const priceSaving = (near - far) * liters;
  const detourFuel = (detourKm * consumption) / 100;
  const detourCost = detourFuel * far + (minutes / 60) * eurPerHour;
  const net = priceSaving - detourCost;
  const perKm = (consumption / 100) * far + (detourKm > 0 ? ((minutes / 60) * eurPerHour) / detourKm : 0);
  const breakEvenKm = perKm > 0 ? priceSaving / perKm : Infinity;
  return { priceSaving, detourCost, net, breakEvenKm };
}

function FillCalc() {
  const t = useT();
  const lang = useLang();
  const vehicle = useActiveVehicle();
  const cur = useCurrentPrices();
  const [liters, setLiters] = useState(vehicle.tankL * 0.8);
  const [price, setPrice] = useState(cur.min ?? 1.749);
  const [compare, setCompare] = useState(cur.mean ?? 1.799);
  const total = liters * price;
  const diff = (compare - price) * liters;
  return (
    <Card>
      <div className="form-grid">
        <Field label={t('calc.liters')}>
          <NumberInput value={liters} onChange={setLiters} step={1} min={0} suffix="l" />
        </Field>
        <Field label={t('calc.price')}>
          <NumberInput value={price} onChange={setPrice} step={0.01} min={0} suffix="€/l" />
        </Field>
        <Field label={t('calc.compare')}>
          <NumberInput value={compare} onChange={setCompare} step={0.01} min={0} suffix="€/l" />
        </Field>
      </div>
      <input type="range" min={1} max={Math.max(vehicle.tankL, 80)} value={liters} onChange={(e) => setLiters(Number(e.target.value))} aria-label={t('calc.liters')} />
      {cur.min != null && (
        <button
          className="btn btn-s btn-ghost"
          onClick={() => {
            setPrice(cur.min!);
            setCompare(cur.mean!);
          }}
        >
          <Icon name="refresh" size={14} /> {t('calc.useCurrent')}
        </button>
      )}
      <div className="kpis">
        <Stat label={t('calc.total')} value={formatEUR(total, lang)} tone="brand" />
        <Stat label={t('calc.difference')} value={formatEUR(diff, lang)} tone={diff >= 0 ? 'cheap' : 'expensive'} sub={`${formatNum((compare - price) * 100, lang, 1)} ct/l`} />
      </div>
    </Card>
  );
}

function DetourCalc() {
  const t = useT();
  const lang = useLang();
  const vehicle = useActiveVehicle();
  const cur = useCurrentPrices();
  const [near, setNear] = useState(cur.mean ?? 1.799);
  const [far, setFar] = useState(cur.min ?? 1.729);
  const [liters, setLiters] = useState(Math.round(vehicle.tankL * 0.8));
  const [km, setKm] = useState(6);
  const [cons, setCons] = useState(vehicle.consumption);
  const [minutes, setMinutes] = useState(8);
  const [eurH, setEurH] = useState(0);
  const r = detourResult(near, far, liters, km, cons, minutes, eurH);
  return (
    <Card>
      <div className="form-grid">
        <Field label={t('calc.nearPrice')}>
          <NumberInput value={near} onChange={setNear} step={0.01} suffix="€/l" />
        </Field>
        <Field label={t('calc.farPrice')}>
          <NumberInput value={far} onChange={setFar} step={0.01} suffix="€/l" />
        </Field>
        <Field label={t('calc.liters')}>
          <NumberInput value={liters} onChange={setLiters} step={1} min={0} suffix="l" />
        </Field>
        <Field label={t('calc.detourKm')}>
          <NumberInput value={km} onChange={setKm} step={1} min={0} suffix="km" />
        </Field>
        <Field label={t('calc.consumption')}>
          <NumberInput value={cons} onChange={setCons} step={0.1} min={0} suffix="l/100" />
        </Field>
        <Field label={t('calc.detourMinutes')}>
          <NumberInput value={minutes} onChange={setMinutes} step={1} min={0} suffix="min" />
        </Field>
        <Field label={t('calc.timeValue')}>
          <NumberInput value={eurH} onChange={setEurH} step={1} min={0} suffix="€/h" />
        </Field>
      </div>
      <div className={`verdict ${r.net >= 0 ? 'verdict-yes' : 'verdict-no'}`}>
        <Icon name={r.net >= 0 ? 'check' : 'x'} size={22} />
        <div>
          <strong>{r.net >= 0 ? t('calc.worth', { eur: formatEUR(r.net, lang) }) : t('calc.notWorth', { eur: formatEUR(-r.net, lang) })}</strong>
          {Number.isFinite(r.breakEvenKm) && r.breakEvenKm > 0 && <p className="small">{t('calc.breakEven', { km: formatNum(r.breakEvenKm, lang, 1) })}</p>}
        </div>
      </div>
    </Card>
  );
}

function TripCalc() {
  const t = useT();
  const lang = useLang();
  const vehicle = useActiveVehicle();
  const cur = useCurrentPrices();
  const [km, setKm] = useState(250);
  const [cons, setCons] = useState(vehicle.consumption);
  const [price, setPrice] = useState(cur.mean ?? 1.789);
  const [people, setPeople] = useState(1);
  const [round, setRound] = useState(false);
  const dist = km * (round ? 2 : 1);
  const liters = (dist * cons) / 100;
  const cost = liters * price;
  return (
    <Card>
      <div className="form-grid">
        <Field label={t('calc.distance')}>
          <NumberInput value={km} onChange={setKm} step={10} min={0} suffix="km" />
        </Field>
        <Field label={t('calc.consumption')}>
          <NumberInput value={cons} onChange={setCons} step={0.1} min={0} suffix="l/100" />
        </Field>
        <Field label={t('calc.price')}>
          <NumberInput value={price} onChange={setPrice} step={0.01} min={0} suffix="€/l" />
        </Field>
        <Field label={t('calc.passengers')}>
          <NumberInput value={people} onChange={(v) => setPeople(Math.max(1, Math.round(v)))} step={1} min={1} max={9} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={round} onChange={(e) => setRound(e.target.checked)} /> {t('calc.roundTrip')}
      </label>
      <div className="kpis">
        <Stat label={t('calc.tripCost')} value={formatEUR(cost, lang)} sub={`${formatNum(liters, lang, 1)} l · ${formatNum(dist, lang, 0)} km`} tone="brand" />
        <Stat label={t('calc.perPerson')} value={formatEUR(cost / people, lang)} />
        <Stat label={t('calc.per100')} value={formatEUR((cons * price), lang)} />
      </div>
    </Card>
  );
}

function YearCalc() {
  const t = useT();
  const lang = useLang();
  const vehicle = useActiveVehicle();
  const [kmYear, setKmYear] = useState(13000);
  const [cons, setCons] = useState(vehicle.consumption);
  const [ct, setCt] = useState(8);
  const liters = (kmYear * cons) / 100;
  const saving = (liters * ct) / 100;
  return (
    <Card>
      <div className="form-grid">
        <Field label={t('calc.kmPerYear')}>
          <NumberInput value={kmYear} onChange={setKmYear} step={1000} min={0} suffix="km" />
        </Field>
        <Field label={t('calc.consumption')}>
          <NumberInput value={cons} onChange={setCons} step={0.1} min={0} suffix="l/100" />
        </Field>
        <Field label={t('calc.savingCt')}>
          <NumberInput value={ct} onChange={setCt} step={1} min={0} suffix="ct" />
        </Field>
      </div>
      <input type="range" min={1} max={25} value={ct} onChange={(e) => setCt(Number(e.target.value))} aria-label={t('calc.savingCt')} />
      <div className="kpis">
        <Stat label={t('calc.yearSaving')} value={formatEUR(saving, lang, 0)} tone="cheap" sub={`${formatEUR(saving / 12, lang)} / ${lang === 'de' ? 'Monat' : 'month'}`} />
        <Stat label={t('calc.yearLiters')} value={`${formatNum(liters, lang, 0)} l`} />
      </div>
      <p className="muted small">{t('calc.yearHint')}</p>
    </Card>
  );
}
