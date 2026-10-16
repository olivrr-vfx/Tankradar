import type { Lang } from '../store/settings';

const loc = (lang: Lang) => (lang === 'de' ? 'de-DE' : 'en-GB');

/** German-style fuel price: "1,72" + superscript "9". */
export function splitPrice(p: number | null | undefined, lang: Lang): { main: string; sup: string } | null {
  if (p == null || !Number.isFinite(p)) return null;
  const s = p.toFixed(3);
  const sep = lang === 'de' ? ',' : '.';
  return { main: s.slice(0, -1).replace('.', sep), sup: s.slice(-1) };
}

export function formatPricePlain(p: number | null | undefined, lang: Lang): string {
  const sp = splitPrice(p, lang);
  return sp ? `${sp.main}${sp.sup} €` : '–';
}

export function formatEUR(v: number, lang: Lang, digits = 2): string {
  return new Intl.NumberFormat(loc(lang), { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

export function formatNum(v: number, lang: Lang, digits = 1): string {
  return new Intl.NumberFormat(loc(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}

/** Signed cent difference, e.g. "−4,0 ct". */
export function formatCt(deltaEur: number, lang: Lang, digits = 1): string {
  const v = deltaEur * 100;
  const sign = v > 0.05 ? '+' : v < -0.05 ? '−' : '±';
  return `${sign}${formatNum(Math.abs(v), lang, digits)} ct`;
}

export function formatKm(km: number, lang: Lang): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${formatNum(km, lang, km < 10 ? 1 : 0)} km`;
}

export function formatTime(t: number, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { hour: '2-digit', minute: '2-digit' }).format(t);
}

export function formatDateTime(t: number, lang: Lang): string {
  return new Intl.DateTimeFormat(loc(lang), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(t);
}

export function formatDate(t: number, lang: Lang, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }): string {
  return new Intl.DateTimeFormat(loc(lang), opts).format(t);
}

export function formatDuration(sec: number, lang: Lang): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return lang === 'de' ? `${m} min` : `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatAgo(t: number, lang: Lang): string {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return lang === 'de' ? 'gerade eben' : 'just now';
  if (min < 60) return lang === 'de' ? `vor ${min} Min.` : `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return lang === 'de' ? `vor ${h} Std.` : `${h} h ago`;
  return formatDate(t, lang);
}

/** Parse "1,739" or "1.739" from user input. */
export function parseNum(s: string): number {
  return Number(String(s).replace(/\s/g, '').replace(',', '.'));
}
