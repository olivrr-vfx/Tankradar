import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    setW(Math.floor(el.getBoundingClientRect().width));
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min < 1e-9) {
    min -= 0.01;
    max += 0.01;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export interface LinePoint {
  t: number;
  p: number;
}

export interface LineChartProps {
  points: LinePoint[];
  from: number;
  to: number;
  step?: boolean;
  band?: { t: number; lo: number; hi: number }[];
  reference?: { value: number; label: string };
  height?: number;
  formatX: (t: number) => string;
  formatY: (v: number) => string;
  formatTip: (pt: LinePoint) => ReactNode;
  xTicks?: number;
  ariaLabel: string;
}

/** Single-series line/step chart with crosshair tooltip, optional min–max band and reference line. */
export function LineChart({ points, from, to, step = true, band, reference, height = 220, formatX, formatY, formatTip, xTicks = 5, ariaLabel }: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<LinePoint | null>(null);
  const m = { l: 48, r: 12, t: 12, b: 26 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;

  const { yMin, yMax } = useMemo(() => {
    const vals = [...points.map((p) => p.p), ...(band ?? []).flatMap((b) => [b.lo, b.hi])];
    if (reference) vals.push(reference.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max(0.01, (hi - lo) * 0.12);
    return { yMin: lo - pad, yMax: hi + pad };
  }, [points, band, reference]);

  const x = (t: number) => m.l + ((t - from) / (to - from || 1)) * iw;
  const y = (v: number) => m.t + (1 - (v - yMin) / (yMax - yMin || 1)) * ih;
  const yt = niceTicks(yMin, yMax, 4);
  const xt = Array.from({ length: xTicks }, (_, i) => from + ((to - from) * (i + 0.5)) / xTicks);

  let d = '';
  points.forEach((pt, i) => {
    const px = x(Math.max(from, pt.t));
    const py = y(pt.p);
    if (i === 0) d += `M${px},${py}`;
    else d += step ? `H${px}V${py}` : `L${px},${py}`;
  });
  if (points.length && step) d += `H${x(Math.min(to, Date.now()))}`;
  const area = points.length ? `${d}V${m.t + ih}H${x(Math.max(from, points[0].t))}Z` : '';
  const bandPath = band?.length
    ? `M${band.map((b) => `${x(b.t)},${y(b.hi)}`).join('L')}L${[...band].reverse().map((b) => `${x(b.t)},${y(b.lo)}`).join('L')}Z`
    : '';

  const onMove = (clientX: number, rect: DOMRect) => {
    const t = from + ((clientX - rect.left - m.l) / iw) * (to - from);
    let best: LinePoint | null = null;
    if (step) {
      for (const pt of points) if (pt.t <= t) best = pt;
      if (best) best = { t: Math.max(t, from), p: best.p };
    } else {
      let bd = Infinity;
      for (const pt of points) {
        const dd = Math.abs(pt.t - t);
        if (dd < bd) {
          bd = dd;
          best = pt;
        }
      }
    }
    setHover(best && t <= Math.min(to, Date.now() + 1) ? best : null);
  };

  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
        >
          {yt.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} className="grid" />
              <text x={m.l - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
                {formatY(v)}
              </text>
            </g>
          ))}
          {xt.map((t) => (
            <text key={t} x={x(t)} y={height - 6} className="axis" textAnchor="middle">
              {formatX(t)}
            </text>
          ))}
          {bandPath && <path d={bandPath} className="band" />}
          {area && <path key={`a${from}-${points.length}`} d={area} className="area" />}
          {reference && (
            <g>
              <line x1={m.l} x2={m.l + iw} y1={y(reference.value)} y2={y(reference.value)} className="ref-line" />
              <text x={m.l + iw} y={y(reference.value) - 5} textAnchor="end" className="ref-label">
                {reference.label}
              </text>
            </g>
          )}
          <path key={`l${from}-${points.length}`} d={d} className="line draw" pathLength={1} />
          {hover && (
            <g>
              <line x1={x(hover.t)} x2={x(hover.t)} y1={m.t} y2={m.t + ih} className="crosshair" />
              <circle cx={x(hover.t)} cy={y(hover.p)} r={5} className="dot" />
            </g>
          )}
        </svg>
      )}
      {hover && width > 0 && (
        <div className="tooltip" style={{ left: Math.min(Math.max(x(hover.t), 70), width - 70), top: 0 }}>
          {formatTip(hover)}
        </div>
      )}
    </div>
  );
}

export interface BarDatum {
  key: string | number;
  label: string;
  value: number;
  tone?: 'cheap' | 'expensive' | 'brand' | 'neutral' | 'mid';
  highlight?: boolean;
  tip?: ReactNode;
}

/** Vertical bars from a zero baseline (supports negative values for deviations). */
export function BarChart({ data, height = 180, formatY, labelEvery = 1, ariaLabel, zeroBased = true }: { data: BarDatum[]; height?: number; formatY: (v: number) => string; labelEvery?: number; ariaLabel: string; zeroBased?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 44, r: 6, t: 10, b: 24 };
  const iw = Math.max(10, width - m.l - m.r);
  const ih = height - m.t - m.b;
  const vals = data.map((d) => d.value);
  let lo = Math.min(...vals, zeroBased ? 0 : Infinity);
  let hi = Math.max(...vals, zeroBased ? 0 : -Infinity);
  if (!zeroBased) {
    const pad = (hi - lo) * 0.25 || 0.01;
    lo -= pad;
    hi += pad * 0.4;
  }
  if (hi - lo < 1e-9) hi = lo + 1;
  const y = (v: number) => m.t + (1 - (v - lo) / (hi - lo)) * ih;
  const slot = iw / Math.max(1, data.length);
  const bw = Math.max(2, Math.min(36, slot - 2));
  const base = zeroBased ? y(0) : m.t + ih;
  const ticks = niceTicks(lo, hi, 3);
  return (
    <div className="chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={m.l + iw} y1={y(v)} y2={y(v)} className={Math.abs(v) < 1e-9 && zeroBased ? 'baseline' : 'grid'} />
              <text x={m.l - 6} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
                {formatY(v)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = m.l + slot * i + slot / 2;
            const top = Math.min(y(d.value), base);
            const h = Math.max(1, Math.abs(y(d.value) - base));
            const r = Math.min(4, bw / 2, h);
            const up = d.value >= 0 || !zeroBased;
            // Rounded data-end, square baseline end.
            const x0 = cx - bw / 2;
            const x1 = cx + bw / 2;
            const path = up
              ? `M${x0},${top + h}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${top + h}Z`
              : `M${x0},${top}V${top + h - r}Q${x0},${top + h} ${x0 + r},${top + h}H${x1 - r}Q${x1},${top + h} ${x1},${top + h - r}V${top}Z`;
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)} onClick={() => setHover(i)}>
                <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
                <path
                  d={path}
                  className={`bar ${up ? 'grow-up' : 'grow-down'} tone-${d.tone ?? 'brand'} ${d.highlight ? 'hl' : ''} ${hover === i ? 'hover' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 30) * 22}ms` }}
                />
                {(i % labelEvery === 0 || d.highlight) && (
                  <text x={cx} y={height - 6} className={`axis ${d.highlight ? 'axis-hl' : ''}`} textAnchor="middle">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hover != null && data[hover] && width > 0 && (
        <div className="tooltip" style={{ left: Math.min(Math.max(m.l + slot * hover + slot / 2, 70), width - 70), top: 0 }}>
          {data[hover].tip ?? `${data[hover].label}: ${formatY(data[hover].value)}`}
        </div>
      )}
    </div>
  );
}

/** Horizontal bar list (labels left, bars right) – used for brand comparisons. */
export function HBars({ data, format, min }: { data: { key: string; label: ReactNode; value: number; tone?: string; sub?: ReactNode }[]; format: (v: number) => string; min?: number }) {
  const vals = data.map((d) => d.value);
  const lo = min ?? Math.min(...vals) - (Math.max(...vals) - Math.min(...vals)) * 0.35 - 0.005;
  const hi = Math.max(...vals);
  return (
    <ul className="hbars">
      {data.map((d) => (
        <li key={d.key}>
          <span className="hbar-label">
            {d.label}
            {d.sub && <span className="muted small"> {d.sub}</span>}
          </span>
          <span className="hbar-track">
            <span className={`hbar tone-${d.tone ?? 'brand'}`} style={{ width: `${Math.max(3, ((d.value - lo) / (hi - lo || 1)) * 100)}%` }} />
          </span>
          <span className="hbar-value">{format(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}
