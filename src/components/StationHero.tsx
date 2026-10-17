import { useEffect, useMemo, useState } from 'react';
import { useLang, useT } from '../i18n';
import { brandMeta, type BrandMeta } from '../lib/brands';
import type { FuelType, Station } from '../lib/types';
import { FUEL_TYPES } from '../lib/types';
import { findStationPhoto, streetViewImageUrl, streetViewUrl, type StationPhoto } from '../services/photos';
import { openExternal } from '../services/platform';
import { useSettings } from '../store/settings';
import { BrandLogo } from './BrandLogo';
import { Icon } from './Icon';
import { AerialView } from './AerialView';

type Sky = 'day' | 'dusk' | 'night';

// Repeating low skyline from far left to far right.
const SKYLINE = (() => {
  let d = 'M-2400 290 V230';
  const seg = 'h60 v-30 h40 v20 h50 v-45 h35 v55 h60 v-25 h45 v35 h70 v-20 h50 v30 h50 v-15 h60 v15 h130';
  for (let i = 0; i < 8; i++) d += ` ${seg}`;
  return `${d} V290 Z`;
})();
const STARS: [number, number][] = Array.from({ length: 46 }, (_, i) => [((i * 197) % 2600) - 900, ((i * 83) % 260) - 120]);
const skyFor = (h: number): Sky => (h >= 7 && h < 18 ? 'day' : (h >= 18 && h < 21) || (h >= 5 && h < 7) ? 'dusk' : 'night');

const SKIES: Record<Sky, [string, string, string]> = {
  day: ['#5fb4ff', '#bfe3ff', '#fff6c9'],
  dusk: ['#3b2d6b', '#e0607e', '#ffb36b'],
  night: ['#050b1d', '#132353', '#c9d6ff'],
};

/** Illustrated station scene in the brand's colours with a live price pylon. */
export function StationIllustration({ meta, prices, hour }: { meta: BrandMeta; prices: Partial<Record<FuelType, number | null>>; hour: number }) {
  const sky = skyFor(hour);
  const [top, bottom, sun] = SKIES[sky];
  const night = sky === 'night';
  const lit = sky !== 'day';
  const accent = meta.accent ?? meta.fg;
  const lang = useLang();
  const fmt = (p: number | null | undefined) => (p == null ? '-.--' : p.toFixed(2).replace('.', lang === 'de' ? ',' : '.'));
  const rows = FUEL_TYPES.map((f) => ({ f, p: prices[f] })).filter((r) => r.p != null);
  const id = meta.key;
  return (
    <svg className={`illu sky-${sky}`} viewBox="0 0 800 360" preserveAspectRatio="xMidYMax meet" role="img" aria-label={meta.name}>
      <defs>
        <linearGradient id={`sky-${id}`} gradientUnits="userSpaceOnUse" x1="0" y1="-300" x2="0" y2="290">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={`glow-${id}`} cx="0.5" cy="0" r="0.8">
          <stop offset="0" stopColor="#fff7d6" stopOpacity={lit ? 0.75 : 0} />
          <stop offset="1" stopColor="#fff7d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`asph-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={night ? '#1b2030' : '#59606e'} />
          <stop offset="1" stopColor={night ? '#0e121c' : '#3b404b'} />
        </linearGradient>
      </defs>
      {/* sky and ground extend far beyond the viewBox so wide/tall screens never show edges */}
      <rect x="-3000" y="-1500" width="6800" height="1860" fill={`url(#sky-${id})`} />
      {night ? (
        <g className="stars">
          {STARS.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 3 ? 1.4 : 2} fill="#fff" style={{ animationDelay: `${i * 0.37}s` }} />
          ))}
          <circle cx="620" cy="70" r="22" fill={sun} opacity="0.95" />
          <circle cx="611" cy="64" r="22" fill={top} />
        </g>
      ) : (
        <circle className="sun" cx={sky === 'day' ? 640 : 600} cy={sky === 'day' ? 70 : 150} r={sky === 'day' ? 30 : 44} fill={sun} opacity="0.95" />
      )}
      {/* distant skyline */}
      <path d={SKYLINE} fill={night ? '#0b1430' : sky === 'dusk' ? '#5d4a80' : '#9cc4e6'} opacity="0.6" />
      {/* ground */}
      <rect x="-3000" y="285" width="6800" height="400" fill={`url(#asph-${id})`} />
      <g className="road-lines">
        {Array.from({ length: 60 }, (_, i) => (
          <rect key={i} x={i * 80 - 2420} y="334" width="44" height="5" rx="2" fill="#fff" opacity="0.55" />
        ))}
      </g>
      {/* shop */}
      <g>
        <rect x="470" y="185" width="230" height="102" rx="6" fill={night ? '#2a3348' : '#eef1f6'} />
        <rect x="470" y="176" width="230" height="18" rx="4" fill={meta.bg} stroke={meta.bg === '#ffffff' ? meta.fg : 'none'} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={488 + i * 70} y="210" width="56" height="42" rx="3" fill={lit ? '#ffe7a3' : '#a9c9e6'} opacity={lit ? 0.9 : 0.8} />
        ))}
        <rect x="660" y="230" width="26" height="57" rx="2" fill={lit ? '#ffd889' : '#7f9bb8'} />
      </g>
      {/* canopy glow */}
      <ellipse cx="300" cy="160" rx="260" ry="150" fill={`url(#glow-${id})`} />
      {/* columns */}
      <rect x="148" y="150" width="12" height="137" fill={night ? '#5a6478' : '#c7cdd8'} />
      <rect x="440" y="150" width="12" height="137" fill={night ? '#5a6478' : '#c7cdd8'} />
      {/* pumps */}
      {[210, 350].map((x) => (
        <g key={x} className="pump">
          <rect x={x - 26} y="279" width="92" height="9" rx="3" fill={night ? '#3a4356' : '#d5dae3'} />
          <rect x={x} y="205" width="40" height="76" rx="6" fill={meta.bg} stroke={meta.bg === '#ffffff' ? '#cfd5df' : 'none'} />
          <rect x={x + 7} y="215" width="26" height="16" rx="2" fill="#0f1a2a" />
          <rect x={x + 10} y="219" width="20" height="3" rx="1" fill="#5cffb0" className="pump-led" />
          <rect x={x + 10} y="225" width="14" height="3" rx="1" fill="#5cffb0" opacity="0.7" />
          <rect x={x + 15} y="240" width="10" height="26" rx="3" fill={meta.fg} opacity="0.85" />
        </g>
      ))}
      {/* car at the pump */}
      <g className="car">
        <path d="M262 286 q2 -26 26 -30 l22 -18 q8 -6 20 -6 h40 q12 0 20 8 l18 16 q22 4 24 30 z" fill={night ? '#c7354a' : '#e5484d'} />
        <path d="M300 255 l16 -14 q4 -3 10 -3 h18 v17z M350 255 v-17 h12 q7 0 12 5 l12 12z" fill={night ? '#9fc3ff' : '#cfe7ff'} opacity="0.9" />
        <circle cx="295" cy="287" r="13" fill="#141821" />
        <circle cx="295" cy="287" r="5" fill="#9aa3b2" />
        <circle cx="375" cy="287" r="13" fill="#141821" />
        <circle cx="375" cy="287" r="5" fill="#9aa3b2" />
        {lit && <path d="M410 268 l70 -10 v26z" fill="#fff6c2" opacity="0.35" />}
      </g>
      {/* canopy */}
      <rect x="90" y="118" width="430" height="38" rx="4" fill={meta.bg} stroke={meta.bg === '#ffffff' ? '#d4d9e2' : 'none'} strokeWidth="2" />
      <rect x="90" y="150" width="430" height="7" fill={accent} />
      <rect x="96" y="157" width="418" height="4" rx="2" fill={lit ? '#fffbe6' : '#e9edf3'} className="canopy-lights" />
      <text x="305" y="146" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontWeight="800" fontSize="24" fill={meta.fg} letterSpacing="1">
        {meta.mark.toUpperCase()}
      </text>
      {/* price pylon */}
      <g className="pylon">
        <rect x="726" y="105" width="10" height="182" fill={night ? '#5a6478' : '#aab3c2'} />
        <rect x="694" y="64" width="74" height={58 + rows.length * 34} rx="6" fill="#121722" />
        <rect x="694" y="64" width="74" height="40" rx="6" fill={meta.bg} />
        <text x="731" y="91" textAnchor="middle" fontFamily="Inter Variable, Inter, sans-serif" fontWeight="800" fontSize={meta.mark.length > 4 ? 13 : 17} fill={meta.fg}>
          {meta.mark}
        </text>
        {rows.map((r, i) => (
          <g key={r.f}>
            <text x="701" y={124 + i * 34} fontFamily="Inter Variable, Inter, sans-serif" fontWeight="700" fontSize="9" fill="#9aa6bd">
              {r.f === 'diesel' ? 'DIESEL' : r.f.toUpperCase()}
            </text>
            <text x="761" y={140 + i * 34} textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fontWeight="700" fontSize="19" fill="#ffcf3d" className="led">
              {fmt(r.p)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

type HeroView = 'street' | 'photo' | 'aerial' | 'illu';

export function StationHero({ station, fuel }: { station: Station; fuel: FuelType }) {
  const t = useT();
  const { remoteImages, mapillaryToken, googleApiKey } = useSettings();
  const meta = useMemo(() => brandMeta(station.brand, station.name), [station.brand, station.name]);
  const [photo, setPhoto] = useState<StationPhoto | null>(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [aerialLoaded, setAerialLoaded] = useState(false);
  const real = remoteImages && station.source !== 'demo';
  const [streetOk, setStreetOk] = useState<boolean | null>(null);
  const hasStreet = real && !!googleApiKey && streetOk !== false;
  const initial: HeroView = real ? (googleApiKey ? 'street' : 'aerial') : 'illu';
  const [view, setView] = useState<HeroView>(initial);
  const hour = new Date().getHours();

  useEffect(() => {
    setPhoto(null);
    setPhotoLoaded(false);
    setAerialLoaded(false);
    setStreetOk(null);
    setView(initial);
    if (!real) return;
    let cancelled = false;
    findStationPhoto(station.id, station, mapillaryToken).then((p) => {
      if (cancelled || !p) return;
      setPhoto(p);
      setView((v) => (v === 'aerial' ? 'photo' : v));
    });
    return () => {
      cancelled = true;
    };
  }, [station.id, station.lat, station.lng, real, mapillaryToken, googleApiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  void fuel;
  const options: { v: HeroView; label: string }[] = [
    ...(hasStreet ? [{ v: 'street' as const, label: 'Street View' }] : []),
    ...(photo ? [{ v: 'photo' as const, label: t('hero.photo') }] : []),
    ...(real ? [{ v: 'aerial' as const, label: t('hero.aerial') }] : []),
    { v: 'illu', label: t('hero.illu') },
  ];
  return (
    <div className="hero">
      <StationIllustration meta={meta} prices={station.prices} hour={hour} />
      {real && view === 'aerial' && (
        <div className={`hero-layer ${aerialLoaded ? 'in' : ''}`}>
          <AerialView point={station} onLoad={() => setAerialLoaded(true)} />
        </div>
      )}
      {hasStreet && view === 'street' && (
        <img
          className={`hero-photo ${streetOk ? 'in' : ''}`}
          src={streetViewImageUrl(station, googleApiKey)}
          alt={station.name}
          referrerPolicy="no-referrer"
          onLoad={() => setStreetOk(true)}
          onError={() => {
            setStreetOk(false);
            setView(photo ? 'photo' : 'aerial');
          }}
        />
      )}
      {photo && view === 'photo' && (
        <img className={`hero-photo ${photoLoaded ? 'in' : ''}`} src={photo.url} alt={station.name} onLoad={() => setPhotoLoaded(true)} referrerPolicy="no-referrer" />
      )}
      <div className="hero-shade" />
      <div className="hero-logo">
        <BrandLogo brand={station.brand} name={station.name} size={64} />
      </div>
      <div className="hero-actions">
        {options.length > 1 && (
          <div className="hero-switch" role="radiogroup">
            {options.map((o) => (
              <button key={o.v} role="radio" aria-checked={view === o.v} className={view === o.v ? 'on' : ''} onClick={() => setView(o.v)}>
                {o.label}
              </button>
            ))}
          </div>
        )}
        <button className="glass-btn" onClick={() => void openExternal(streetViewUrl(station))}>
          <Icon name="map" size={16} /> Street View
        </button>
      </div>
      {view === 'photo' && photo && photoLoaded && (
        <a className="hero-credit" href={photo.link} target="_blank" rel="noreferrer">
          {t('station.photoBy')} {photo.credit} · {photo.license}
        </a>
      )}
      {view === 'aerial' && aerialLoaded && <span className="hero-credit">{t('hero.aerialCredit')}</span>}
      {view === 'street' && streetOk && <span className="hero-credit">© Google Street View</span>}
    </div>
  );
}
