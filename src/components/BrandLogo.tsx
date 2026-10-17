import { useEffect, useState } from 'react';
import { brandMeta, logoUrls } from '../lib/brands';
import { useSettings } from '../store/settings';

/** Which candidate URL works for a brand (persisted, so failed lookups are not repeated). */
const KEY = 'tankradar.logos.v2';
let known: Record<string, string | null> = {};
try {
  known = JSON.parse(localStorage.getItem(KEY) ?? '{}');
} catch {
  known = {};
}
const remember = (brand: string, url: string | null) => {
  known[brand] = url;
  try {
    localStorage.setItem(KEY, JSON.stringify(known));
  } catch {
    /* ignore */
  }
};

/**
 * Brand logo: the official logo from Wikimedia Commons when allowed and available,
 * otherwise a crisp generated badge in the brand's colours.
 */
export function BrandLogo({ brand, name, size = 40, className = '' }: { brand: string; name?: string; size?: number; className?: string }) {
  const meta = brandMeta(brand, name);
  const remote = useSettings((s) => s.remoteImages);
  const candidates = remote ? logoUrls(meta) : [];
  const cached = known[meta.key];
  const [idx, setIdx] = useState(0);
  const [ok, setOk] = useState(!!cached);
  useEffect(() => {
    setIdx(0);
    setOk(!!known[meta.key]);
  }, [meta.key]);

  const url = cached === null ? null : (cached ?? candidates[idx] ?? null);
  const fontSize = Math.max(9, Math.round(size * (meta.mark.length > 4 ? 0.24 : meta.mark.length > 2 ? 0.3 : 0.4)));
  return (
    <span
      className={`brand-logo ${ok ? 'has-img' : ''} ${className}`}
      style={{ width: size, height: size, background: ok ? '#fff' : meta.bg, color: meta.fg, fontSize, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      {!ok && <span className="brand-mark">{meta.mark}</span>}
      {remote && url && (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ display: ok ? 'block' : 'none' }}
          onLoad={() => {
            remember(meta.key, url);
            setOk(true);
          }}
          onError={() => {
            if (known[meta.key]) {
              // a previously working URL failed (offline) – just show the badge
              setOk(false);
              return;
            }
            if (idx + 1 < candidates.length) setIdx(idx + 1);
            else {
              if (navigator.onLine) remember(meta.key, null);
              setOk(false);
            }
          }}
        />
      )}
    </span>
  );
}
