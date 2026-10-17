import { useEffect, useRef, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import { splitPrice } from '../i18n/format';
import { useLang, useT } from '../i18n';
import type { PriceLevel } from '../lib/stats';
import { Icon, type IconName } from './Icon';
import { RadarLoader, useCountUp } from './motion';

export function PriceTag({ price, size = 'm', level, animate = true }: { price: number | null | undefined; size?: 's' | 'm' | 'l' | 'xl'; level?: PriceLevel; animate?: boolean }) {
  const lang = useLang();
  const shown = useCountUp(animate ? price : null, { duration: 650 });
  const sp = splitPrice(animate ? (shown == null ? price : Math.round(shown * 1000) / 1000) : price, lang);
  if (!sp) return <span className={`price price-${size} price-none`}>–</span>;
  return (
    <span className={`price price-${size} ${level ? `lvl-${level}` : ''}`}>
      {sp.main}
      <sup>{sp.sup}</sup>
    </span>
  );
}

const LEVEL_ICON: Record<PriceLevel, IconName> = { cheap: 'trendDown', mid: 'more', expensive: 'trendUp' };

export function LevelBadge({ level }: { level: PriceLevel }) {
  const t = useT();
  return (
    <span className={`badge badge-${level}`}>
      <Icon name={LEVEL_ICON[level]} size={14} />
      {t(`level.${level}`)}
    </span>
  );
}

export function OpenBadge({ open }: { open: boolean | null }) {
  const t = useT();
  if (open == null) return null;
  return <span className={`dot-label ${open ? 'is-open' : 'is-closed'}`}>{open ? t('common.open') : t('common.closed')}</span>;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'm',
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  size?: 's' | 'm';
  ariaLabel?: string;
}) {
  return (
    <div className={`segmented seg-${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, hint, action, children, className = '' }: { title?: ReactNode; hint?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {hint && <p className="muted small">{hint}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: PriceLevel | 'brand' }) {
  return (
    <div className={`stat ${tone ? `tone-${tone}` : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Numeric input that accepts both "1,79" and "1.79". */
export function NumberInput({ value, onChange, step = 1, min, max, suffix, ariaLabel }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; suffix?: string; ariaLabel?: string }) {
  const lang = useLang();
  const fmt = (v: number) => (Number.isFinite(v) ? (lang === 'de' ? String(v).replace('.', ',') : String(v)) : '');
  const [text, setText] = useState(fmt(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lang]);
  return (
    <div className="input-wrap">
      <input
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(fmt(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(v) && e.target.value.trim() !== '') {
            let c = v;
            if (min != null) c = Math.max(min, c);
            if (max != null) c = Math.min(max, c);
            onChange(c);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            let v = value + (e.key === 'ArrowUp' ? step : -step);
            v = Math.round(v * 1000) / 1000;
            if (min != null) v = Math.max(min, v);
            if (max != null) v = Math.min(max, v);
            onChange(v);
            setText(fmt(v));
          }
        }}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Empty({ icon = 'info', children, action }: { icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={26} />
      </div>
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <RadarLoader size={Math.max(16, size)} />;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; wide?: boolean }) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

interface ToastState {
  message: string | null;
  show: (m: string) => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    clearTimeout(toastTimer);
    set({ message });
    toastTimer = setTimeout(() => set({ message: null }), 3200);
  },
}));
export const toast = (m: string) => useToast.getState().show(m);

export function ToastHost() {
  const message = useToast((s) => s.message);
  return (
    <div className="toast-host" aria-live="polite">
      {message && <div className="toast">{message}</div>}
    </div>
  );
}
