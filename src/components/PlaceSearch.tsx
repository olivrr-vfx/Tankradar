import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../i18n';
import type { LatLng } from '../lib/types';
import { searchPlaces, type Place } from '../services/geocode';
import { Icon } from './Icon';
import { Spinner } from './ui';

interface Props {
  value: string;
  placeholder?: string;
  near?: LatLng | null;
  onPick: (p: Place) => void;
  onLocate?: () => void;
  locating?: boolean;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export function PlaceSearch({ value, placeholder, near, onPick, onLocate, locating, ariaLabel, autoFocus }: Props) {
  const t = useT();
  const lang = useLang();
  const [q, setQ] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => setQ(value), [value]);

  useEffect(() => {
    if (!open || q.trim().length < 2 || q === value) {
      setResults([]);
      return;
    }
    const id = ++seq.current;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchPlaces(q, near ?? undefined, lang);
        if (id === seq.current) {
          setResults(r);
          setFailed(false);
          setActive(0);
        }
      } catch {
        if (id === seq.current) setFailed(true);
      } finally {
        if (id === seq.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [q, open, near, lang, value]);

  const pick = (p: Place) => {
    setQ(p.label);
    setOpen(false);
    setResults([]);
    onPick(p);
  };

  return (
    <div className="place-search">
      <div className="search-box">
        <Icon name="search" size={18} />
        <input
          type="search"
          value={q}
          placeholder={placeholder ?? t('radar.searchPlaceholder')}
          aria-label={ariaLabel ?? placeholder ?? t('radar.searchPlaceholder')}
          autoFocus={autoFocus}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(results.length - 1, a + 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
            else if (e.key === 'Enter' && results[active]) pick(results[active]);
            else if (e.key === 'Escape') setOpen(false);
          }}
        />
        {busy && <Spinner size={16} />}
        {onLocate && (
          <button type="button" className="icon-btn" onClick={onLocate} aria-label={t('radar.locate')} title={t('radar.locate')}>
            {locating ? <Spinner size={16} /> : <Icon name="locate" size={18} />}
          </button>
        )}
      </div>
      {open && (results.length > 0 || failed) && (
        <ul className="suggestions" role="listbox">
          {failed && <li className="muted small pad">{t('error.generic', { msg: 'Geocoding' })}</li>}
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'active' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r)}>
                <strong>{r.label}</strong>
                <span className="muted small">{r.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
