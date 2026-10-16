import { ATTRIBUTION } from '../providers';
import { useSettings } from '../store/settings';

export function Attribution() {
  const provider = useSettings((s) => s.provider);
  const a = ATTRIBUTION[provider];
  return (
    <p className="attribution">
      Daten: <a href={a.url} target="_blank" rel="noreferrer">{a.label}</a> · Karte: ©{' '}
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,{' '}
      <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a>
    </p>
  );
}
