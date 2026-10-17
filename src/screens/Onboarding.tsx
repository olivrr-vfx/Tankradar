import { useState } from 'react';
import { Icon, Logo } from '../components/Icon';
import { Segmented } from '../components/ui';
import { useLocate } from '../hooks/useLocate';
import { useT } from '../i18n';
import { FUEL_TYPES } from '../lib/types';
import { useSettings } from '../store/settings';
import { useUser } from '../store/user';

export function Onboarding() {
  const t = useT();
  const s = useSettings();
  const { vehicles, saveVehicle } = useUser();
  const { locate, locating } = useLocate();
  const [step, setStep] = useState(0);
  const done = () => s.set({ onboarded: true });
  const steps = 3;

  return (
    <div className="onboarding" role="dialog" aria-modal="true">
      <div className="onb-card">
        <div className="onb-progress" aria-hidden="true">
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={i <= step ? 'on' : ''} />
          ))}
        </div>

        {step === 0 && (
          <div className="onb-step" key="s0">
            <div className="onb-logo">
              <span className="onb-ping" />
              <span className="onb-ping d2" />
              <Logo size={84} />
            </div>
            <h1>{t('onb.welcome')}</h1>
            <p className="muted">{t('onb.welcomeText')}</p>
            <ul className="onb-features">
              <li><Icon name="map" /> {t('onb.feature1')}</li>
              <li><Icon name="chart" /> {t('onb.feature2')}</li>
              <li><Icon name="route" /> {t('onb.feature3')}</li>
              <li><Icon name="bell" /> {t('onb.feature4')}</li>
            </ul>
            <Segmented value={s.lang} onChange={(lang) => s.set({ lang })} size="s" options={[{ value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
          </div>
        )}

        {step === 1 && (
          <div className="onb-step" key="s1">
            <h2>{t('onb.fuelTitle')}</h2>
            <div className="onb-fuels">
              {FUEL_TYPES.map((f) => (
                <button
                  key={f}
                  className={`onb-fuel ${s.fuel === f ? 'active' : ''}`}
                  onClick={() => {
                    s.set({ fuel: f });
                    const v = vehicles[0];
                    if (v) saveVehicle({ ...v, fuel: f });
                  }}
                >
                  <Icon name="fuel" size={26} />
                  {t(`fuel.${f}`)}
                </button>
              ))}
            </div>
            <h2>{t('onb.sourceTitle')}</h2>
            <p className="muted small">{t('onb.sourceText')}</p>
            <div className="provider-list compact">
              {(['demo', 'tankerkoenig', 'econtrol'] as const).map((p) => (
                <label key={p} className={`provider ${s.provider === p ? 'active' : ''}`}>
                  <input type="radio" name="onb-provider" checked={s.provider === p} onChange={() => s.set({ provider: p })} />
                  <span>
                    <strong>{t(`settings.provider.${p}`)}</strong>
                    <span className="muted small">{t(`settings.provider.${p}Desc`)}</span>
                  </span>
                </label>
              ))}
            </div>
            {s.provider === 'tankerkoenig' && (
              <input className="mono" value={s.tkApiKey} placeholder={t('settings.apiKey')} onChange={(e) => s.set({ tkApiKey: e.target.value.trim() })} aria-label={t('settings.apiKey')} />
            )}
          </div>
        )}

        {step === 2 && (
          <div className="onb-step" key="s2">
            <div className="onb-icon">
              <Icon name="locate" size={40} />
            </div>
            <h2>{t('onb.locationTitle')}</h2>
            <p className="muted">{t('onb.locationText')}</p>
            <button
              className="btn btn-primary btn-l"
              disabled={locating}
              onClick={async () => {
                await locate();
                done();
              }}
            >
              <Icon name="locate" size={18} /> {t('onb.allowLocation')}
            </button>
          </div>
        )}

        <div className="onb-actions">
          <button className="btn btn-ghost" onClick={done}>
            {t('onb.skip')}
          </button>
          {step < steps - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              {t('onb.next')} <Icon name="next" size={16} />
            </button>
          ) : (
            <button className="btn" onClick={done}>
              {t('onb.start')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
