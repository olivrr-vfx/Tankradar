import { useState } from 'react';
import { brandMeta, logoUrl } from '../lib/brands';
import { useSettings } from '../store/settings';

const loaded = new Map<string, boolean>();

/**
 * Brand logo: a crisp generated badge in brand colours, upgraded to the real logo (site icon)
 * when remote images are allowed and a sharp enough version is available.
 */
export function BrandLogo({ brand, name, size = 40, className = '' }: { brand: string; name?: string; size?: number; className?: string }) {
  const meta = brandMeta(brand, name);
  const remote = useSettings((s) => s.remoteImages);
  const url = remote ? logoUrl(meta) : null;
  const [ok, setOk] = useState(url ? loaded.get(url) === true : false);
  const fontSize = Math.max(9, Math.round(size * (meta.mark.length > 4 ? 0.24 : meta.mark.length > 2 ? 0.3 : 0.4)));
  return (
    <span
      className={`brand-logo ${ok ? 'has-img' : ''} ${className}`}
      style={{ width: size, height: size, background: ok ? '#fff' : meta.bg, color: meta.fg, fontSize, borderRadius: Math.round(size * 0.28) }}
      aria-hidden="true"
    >
      {!ok && <span className="brand-mark">{meta.mark}</span>}
      {url && loaded.get(url) !== false && (
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          style={{ display: ok ? 'block' : 'none' }}
          onLoad={(e) => {
            const good = e.currentTarget.naturalWidth >= 48;
            loaded.set(url, good);
            setOk(good);
          }}
          onError={() => {
            loaded.set(url, false);
            setOk(false);
          }}
        />
      )}
    </span>
  );
}
