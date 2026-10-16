import { useEffect, useMemo, useState } from 'react';
import { AlertEditor } from '../components/AlertEditor';
import { Icon } from '../components/Icon';
import { StationRow } from '../components/StationRow';
import { Card, Empty, Toggle } from '../components/ui';
import { formatAgo, formatPricePlain } from '../i18n/format';
import { useLang, useT } from '../i18n';
import { priceLevel, summarize } from '../lib/stats';
import { useData } from '../store/data';
import { useSettings } from '../store/settings';
import { useUser } from '../store/user';
import { FuelSwitch } from './Radar';

export function Favorites() {
  const t = useT();
  const lang = useLang();
  const { favorites, alerts, saveAlert, removeAlert } = useUser();
  const { fuel, autoRefreshMin } = useSettings();
  const refreshFavorites = useData((s) => s.refreshFavorites);
  const [editor, setEditor] = useState(false);
  const favs = useMemo(
    () => Object.values(favorites).sort((a, b) => (a.prices[fuel] ?? 99) - (b.prices[fuel] ?? 99)),
    [favorites, fuel],
  );
  const summary = summarize(favs.map((s) => s.prices[fuel] ?? NaN));

  useEffect(() => {
    void refreshFavorites();
  }, [refreshFavorites]);

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <h1>{t('fav.title')}</h1>
        <FuelSwitch size="s" />
      </header>

      <Card title={`${t('nav.favorites')} (${favs.length})`}>
        {favs.length === 0 ? (
          <Empty icon="star">{t('fav.empty')}</Empty>
        ) : (
          <div className="station-list">
            {favs.map((s) => (
              <StationRow key={s.id} station={s} fuel={fuel} level={priceLevel(s.prices[fuel] ?? NaN, summary)} />
            ))}
            <p className="muted small">{t('common.updated', { time: formatAgo(Math.max(...favs.map((f) => f.updatedAt)), lang) })}</p>
          </div>
        )}
      </Card>

      <Card
        title={t('fav.alerts')}
        action={
          <button className="btn btn-s btn-primary" onClick={() => setEditor(true)}>
            <Icon name="plus" size={16} /> {t('common.add')}
          </button>
        }
      >
        {alerts.length === 0 ? (
          <Empty icon="bell">{t('fav.alertsEmpty')}</Empty>
        ) : (
          <ul className="alert-list">
            {alerts.map((a) => (
              <li key={a.id}>
                <Icon name="bell" size={18} />
                <div className="grow">
                  <strong>
                    {t(`fuel.${a.fuel}`)} {t('alert.below', { price: formatPricePlain(a.threshold, lang) })}
                  </strong>
                  <span className="muted small">{a.target === 'area' ? t('alert.anyArea') : a.label}</span>
                </div>
                <Toggle checked={a.enabled} onChange={(enabled) => saveAlert({ ...a, enabled })} label={<span className="sr-only">on</span>} />
                <button className="icon-btn" aria-label={t('common.delete')} onClick={() => removeAlert(a.id)}>
                  <Icon name="trash" size={18} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">{t('fav.alertsNote', { n: autoRefreshMin || 5 })}</p>
      </Card>
      <AlertEditor open={editor} onClose={() => setEditor(false)} />
    </div>
  );
}
