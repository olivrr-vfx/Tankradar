import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Card, Field, NumberInput, Segmented, Spinner, Toggle, toast } from '../components/ui';
import { useLang, useT } from '../i18n';
import type { ProviderId, Vehicle } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { getProvider } from '../providers';
import { clearHistory, exportHistory, importHistory } from '../services/historyStore';
import { openExternal, saveTextFile } from '../services/platform';
import { buildLabel, hardReload } from '../services/update';
import { DEFAULT_LOCATION, useSettings } from '../store/settings';
import { uid, useUser } from '../store/user';
import { availableNavApps } from '../components/NavChooser';

const REPO = 'https://github.com/olivrr-vfx/tankradar';
const PROVIDERS: ProviderId[] = ['demo', 'tankerkoenig', 'econtrol', 'server'];

export function Settings() {
  const t = useT();
  const lang = useLang();
  const s = useSettings();
  const user = useUser();
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const test = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const center = s.location ?? DEFAULT_LOCATION;
      const list = await getProvider().search(center, 5);
      setTestMsg({ ok: true, text: t('settings.testOk', { n: list.length }) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestMsg({ ok: false, text: t('settings.testFail', { msg: msg === 'missingKey' || msg === 'missingServer' ? t(`error.${msg}`) : msg }) });
    } finally {
      setTesting(false);
    }
  };

  const backup = async () => {
    const { favorites, vehicles, activeVehicleId, alerts, log } = useUser.getState();
    const { set: _set, ...settings } = useSettings.getState();
    void _set;
    const data = { app: 'tankradar', version: 1, exportedAt: new Date().toISOString(), settings: { ...settings, tkApiKey: '' }, user: { favorites, vehicles, activeVehicleId, alerts, log }, history: await exportHistory() };
    await saveTextFile(`tankradar-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), 'application/json');
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'tankradar') throw new Error('invalid');
      if (data.user) user.replaceAll(data.user);
      if (data.settings) {
        const { tkApiKey: _k, ...rest } = data.settings;
        void _k;
        s.set(rest);
      }
      if (data.history) await importHistory(data.history);
      toast(t('settings.restoreOk'));
    } catch (e) {
      toast(t('settings.testFail', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  return (
    <div className="page page-narrow">
      <h1>{t('settings.title')}</h1>

      <Card title={t('settings.data')}>
        <div className="provider-list" role="radiogroup">
          {PROVIDERS.map((p) => (
            <label key={p} className={`provider ${s.provider === p ? 'active' : ''}`}>
              <input type="radio" name="provider" checked={s.provider === p} onChange={() => s.set({ provider: p })} />
              <span>
                <strong>{t(`settings.provider.${p}`)}</strong>
                <span className="muted small">{t(`settings.provider.${p}Desc`)}</span>
              </span>
            </label>
          ))}
        </div>

        {s.provider === 'tankerkoenig' && (
          <Field label={t('settings.apiKey')} hint={t('settings.apiKeyHelp')}>
            <div className="row gap-s">
              <input className="grow mono" value={s.tkApiKey} placeholder="00000000-0000-0000-0000-000000000000" onChange={(e) => s.set({ tkApiKey: e.target.value.trim() })} spellCheck={false} autoComplete="off" />
              <button type="button" className="btn btn-s" onClick={() => void openExternal('https://creativecommons.tankerkoenig.de/')}>
                <Icon name="external" size={14} /> {t('settings.getKey')}
              </button>
            </div>
          </Field>
        )}
        {s.provider === 'server' && (
          <Field label={t('settings.serverUrl')}>
            <input className="mono" value={s.serverUrl} placeholder="https://tankradar.example.org" onChange={(e) => s.set({ serverUrl: e.target.value.trim() })} spellCheck={false} />
          </Field>
        )}
        <div className="row gap-s">
          <button className="btn" onClick={test} disabled={testing}>
            {testing ? <Spinner size={14} /> : <Icon name="check" size={16} />} {t('settings.test')}
          </button>
          {testMsg && <span className={`small ${testMsg.ok ? 'text-cheap' : 'text-expensive'}`}>{testMsg.text}</span>}
        </div>
        <Field label={t('settings.routerUrl')}>
          <input className="mono" value={s.routerUrl} placeholder="https://router.project-osrm.org" onChange={(e) => s.set({ routerUrl: e.target.value.trim() })} spellCheck={false} />
        </Field>
      </Card>

      <Card title={t('settings.prefs')}>
        <div className="form-grid">
          <Field label={t('settings.defaultFuel')}>
            <Segmented value={s.fuel} onChange={(fuel) => s.set({ fuel })} options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuel.short.${f}`) }))} />
          </Field>
          <Field label={t('settings.theme')}>
            <Segmented
              value={s.theme}
              onChange={(theme) => s.set({ theme })}
              options={(['system', 'light', 'dark'] as const).map((x) => ({ value: x, label: t(`settings.theme.${x}`) }))}
            />
          </Field>
          <Field label={t('settings.language')}>
            <Segmented value={s.lang} onChange={(l) => s.set({ lang: l })} options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
          </Field>
          <Field label={t('settings.navApp')}>
            <select value={s.navApp} onChange={(e) => s.set({ navApp: e.target.value as typeof s.navApp })}>
              <option value="ask">{t('settings.navApp.ask')}</option>
              {availableNavApps().map((a) => (
                <option key={a} value={a}>
                  {t(`nav.${a}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('settings.refresh')}>
            <select value={s.autoRefreshMin} onChange={(e) => s.set({ autoRefreshMin: Number(e.target.value) })}>
              <option value={0}>{t('settings.refreshOff')}</option>
              {[5, 10, 15, 30].map((n) => (
                <option key={n} value={n}>
                  {t('settings.refreshEvery', { n })}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card title={t('settings.images')}>
        <Toggle checked={s.remoteImages} onChange={(remoteImages) => s.set({ remoteImages })} label={t('settings.remoteImages')} />
        <p className="muted small">{t('settings.remoteImagesHint')}</p>
        <Field label={t('settings.google')} hint={t('settings.googleHint')}>
          <div className="row gap-s">
            <input className="grow mono" value={s.googleApiKey} placeholder="AIza…" onChange={(e) => s.set({ googleApiKey: e.target.value.trim() })} spellCheck={false} autoComplete="off" />
            <button type="button" className="btn btn-s" onClick={() => void openExternal('https://console.cloud.google.com/google/maps-apis/credentials')}>
              <Icon name="external" size={14} /> Key
            </button>
          </div>
        </Field>
        <Field label={t('settings.mapillary')} hint={t('settings.mapillaryHint')}>
          <div className="row gap-s">
            <input className="grow mono" value={s.mapillaryToken} placeholder="MLY|…" onChange={(e) => s.set({ mapillaryToken: e.target.value.trim() })} spellCheck={false} autoComplete="off" />
            <button type="button" className="btn btn-s" onClick={() => void openExternal('https://www.mapillary.com/dashboard/developers')}>
              <Icon name="external" size={14} /> Token
            </button>
          </div>
        </Field>
      </Card>

      <Card
        title={t('settings.vehicles')}
        action={
          <button className="btn btn-s" onClick={() => user.saveVehicle({ id: uid(), name: `${lang === 'de' ? 'Fahrzeug' : 'Vehicle'} ${user.vehicles.length + 1}`, fuel: s.fuel, tankL: 50, consumption: 6.5 })}>
            <Icon name="plus" size={16} /> {t('settings.addVehicle')}
          </button>
        }
      >
        <div className="vehicles">
          {user.vehicles.map((v) => (
            <VehicleEditor key={v.id} v={v} active={v.id === user.activeVehicleId} />
          ))}
        </div>
      </Card>

      <Card title={t('settings.privacy')}>
        <p>{t('settings.privacyText')}</p>
        <div className="row gap-s wrap">
          <button className="btn" onClick={() => void backup()}>
            <Icon name="download" size={16} /> {t('settings.backup')}
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="refresh" size={16} /> {t('settings.restore')}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
          <button
            className="btn btn-danger"
            onClick={async () => {
              if (window.confirm(t('settings.clearConfirm'))) {
                await clearHistory();
                toast('✓');
              }
            }}
          >
            <Icon name="trash" size={16} /> {t('settings.clearHistory')}
          </button>
        </div>
      </Card>

      <Card title={t('settings.about')}>
        <p>{t('settings.aboutText')}</p>
        <p className="muted small">{t('settings.version', { v: buildLabel() })}</p>
        <button className="btn btn-s" onClick={() => void hardReload()}>
          <Icon name="refresh" size={16} /> {t('update.check')}
        </button>
        <div className="row gap-s wrap">
          <button className="btn" onClick={() => void openExternal(REPO)}>
            <Icon name="github" size={16} /> {t('settings.source')}
          </button>
          <button className="btn btn-ghost" onClick={() => s.set({ onboarded: false })}>
            <Icon name="info" size={16} /> {t('settings.onboarding')}
          </button>
        </div>
        <h3>{t('settings.credits')}</h3>
        <ul className="credits small">
          <li>Kraftstoffpreise DE: Tankerkönig.de / Markttransparenzstelle für Kraftstoffe (MTS-K), CC BY 4.0</li>
          <li>Kraftstoffpreise AT: E-Control Spritpreisrechner</li>
          <li>Kartendaten: © OpenStreetMap-Mitwirkende (ODbL), Kacheln: OpenFreeMap / OpenMapTiles</li>
          <li>Routing: OSRM (FOSSGIS / Project OSRM), Geocoding: Photon (Komoot) / Nominatim</li>
          <li>Kartendarstellung: MapLibre GL JS (BSD-3)</li>
        </ul>
      </Card>
    </div>
  );
}

function VehicleEditor({ v, active }: { v: Vehicle; active: boolean }) {
  const t = useT();
  const { saveVehicle, removeVehicle, setActiveVehicle, vehicles } = useUser();
  return (
    <div className={`vehicle ${active ? 'active' : ''}`}>
      <div className="vehicle-head">
        <label className="radio-inline">
          <input type="radio" name="activeVehicle" checked={active} onChange={() => setActiveVehicle(v.id)} />
          <Icon name="car" size={18} /> {t('settings.active')}
        </label>
        {vehicles.length > 1 && (
          <button className="icon-btn icon-btn-s" aria-label={t('common.delete')} onClick={() => removeVehicle(v.id)}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      <div className="form-grid">
        <Field label={t('settings.vehicleName')}>
          <input value={v.name} onChange={(e) => saveVehicle({ ...v, name: e.target.value })} />
        </Field>
        <Field label={t('settings.defaultFuel')}>
          <select value={v.fuel} onChange={(e) => saveVehicle({ ...v, fuel: e.target.value as Vehicle['fuel'] })}>
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>
                {t(`fuel.${f}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.tank')}>
          <NumberInput value={v.tankL} onChange={(tankL) => saveVehicle({ ...v, tankL })} min={10} max={200} step={1} suffix="l" />
        </Field>
        <Field label={t('settings.consumption')}>
          <NumberInput value={v.consumption} onChange={(consumption) => saveVehicle({ ...v, consumption })} min={1} max={40} step={0.1} suffix="l/100" />
        </Field>
      </div>
    </div>
  );
}
