import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = (t: number) => 1 - (1 - t) ** 3;

/** Smoothly animates a number from its previous value (first render: from `from`). */
export function useCountUp(value: number | null | undefined, { duration = 700, from }: { duration?: number; from?: number } = {}): number | null {
  const target = value == null || !Number.isFinite(value) ? null : value;
  const [shown, setShown] = useState<number | null>(target == null ? null : from ?? target);
  const prev = useRef<number | null>(from ?? null);
  useEffect(() => {
    if (target == null) {
      setShown(null);
      return;
    }
    const start = prev.current ?? target;
    prev.current = target;
    if (reduced() || start === target) {
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setShown(start + (target - start) * ease(k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return shown;
}

/** Branded loading indicator: a rotating radar sweep with pulsing rings. */
export function RadarLoader({ size = 28, label }: { size?: number; label?: string }) {
  return (
    <span className="radar-loader" style={{ width: size, height: size }} role="status" aria-label={label ?? 'Lädt'}>
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <defs>
          <linearGradient id="rl-sweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="17" className="rl-ring" />
        <circle cx="20" cy="20" r="10" className="rl-ring" />
        <g className="rl-sweep">
          <path d="M20 20 L20 3 A17 17 0 0 1 35.5 13 Z" fill="url(#rl-sweep)" />
        </g>
        <circle cx="20" cy="20" r="2.4" fill="var(--brand)" />
      </svg>
    </span>
  );
}

/** Placeholder rows shown while the first results load. */
export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 0.08}s` }}>
          <span className="sk sk-logo" />
          <span className="sk-lines">
            <span className="sk sk-line" style={{ width: `${55 + ((i * 17) % 30)}%` }} />
            <span className="sk sk-line short" />
          </span>
          <span className="sk sk-price" />
        </div>
      ))}
    </div>
  );
}

/** Indeterminate progress bar for background refreshes (no layout shift). */
export function TopProgress({ active }: { active: boolean }) {
  return <div className={`top-progress ${active ? 'on' : ''}`} aria-hidden="true" />;
}
