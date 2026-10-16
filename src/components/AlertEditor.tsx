import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import type { FuelType } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { requestNotificationPermission } from '../services/platform';
import { useSettings } from '../store/settings';
import { uid, useUser } from '../store/user';
import { Field, Modal, NumberInput, Segmented, toast } from './ui';

export function AlertEditor({ open, onClose, stationId, stationName, suggested }: { open: boolean; onClose: () => void; stationId?: string; stationName?: string; suggested?: number }) {
  const t = useT();
  const favorites = useUser((s) => s.favorites);
  const saveAlert = useUser((s) => s.saveAlert);
  const defFuel = useSettings((s) => s.fuel);
  const [target, setTarget] = useState(stationId ?? 'area');
  const [fuel, setFuel] = useState<FuelType>(defFuel);
  const [threshold, setThreshold] = useState(suggested ?? 1.699);

  useEffect(() => {
    if (open) {
      setTarget(stationId ?? 'area');
      setFuel(defFuel);
      if (suggested) setThreshold(Math.round(suggested * 100) / 100 - 0.001);
    }
  }, [open, stationId, suggested, defFuel]);

  const targets = [
    { id: 'area', label: t('alert.anyArea') },
    ...(stationId && !favorites[stationId] ? [{ id: stationId, label: stationName ?? stationId }] : []),
    ...Object.values(favorites).map((s) => ({ id: s.id, label: `${s.name}, ${s.place}` })),
  ];

  return (
    <Modal open={open} onClose={onClose} title={t('alert.new')}>
      <div className="form">
        <Field label={t('alert.target')}>
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Segmented value={fuel} onChange={setFuel} options={FUEL_TYPES.map((f) => ({ value: f, label: t(`fuel.${f}`) }))} />
        <Field label={t('alert.threshold')}>
          <NumberInput value={threshold} onChange={setThreshold} step={0.01} min={0.5} max={4} suffix="€/l" />
        </Field>
        <div className="row-end">
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              const ok = await requestNotificationPermission();
              if (!ok) toast(t('alert.permissionDenied'));
              const label = targets.find((x) => x.id === target)?.label ?? '';
              saveAlert({ id: uid(), target, label, fuel, threshold, enabled: true, lastNotified: 0 });
              onClose();
            }}
          >
            {t('alert.create')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
