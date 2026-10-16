import { Link } from 'react-router-dom';
import { formatCt, formatKm } from '../i18n/format';
import { useLang, useT } from '../i18n';
import type { PriceLevel } from '../lib/stats';
import type { FuelType, Station } from '../lib/types';
import { Icon } from './Icon';
import { OpenBadge, PriceTag } from './ui';

export function brandLabel(s: Station): string {
  return s.brand || s.name;
}

export function StationRow({
  station,
  fuel,
  level,
  avg,
  selected,
  onHover,
  rank,
  favorite,
}: {
  station: Station;
  fuel: FuelType;
  level: PriceLevel;
  avg?: number;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  rank?: number;
  favorite?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const p = station.prices[fuel];
  const delta = p != null && avg != null ? p - avg : null;
  return (
    <Link
      to={`/station/${encodeURIComponent(station.id)}`}
      className={`station-row ${selected ? 'selected' : ''} ${station.isOpen === false ? 'is-closed-row' : ''}`}
      onMouseEnter={() => onHover?.(station.id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(station.id)}
    >
      <span className={`brand-chip lvl-${level}`} aria-hidden="true">
        {rank != null && rank < 3 ? rank + 1 : brandLabel(station).slice(0, 1).toUpperCase()}
      </span>
      <span className="station-main">
        <span className="station-name">
          {station.name}
          {favorite && <Icon name="star" size={13} filled className="fav-star" />}
        </span>
        <span className="station-sub">
          {[`${station.street} ${station.houseNumber ?? ''}`.trim(), station.place].filter(Boolean).join(', ')}
        </span>
        <span className="station-meta">
          {station.dist != null && <span>{formatKm(station.dist, lang)}</span>}
          <OpenBadge open={station.isOpen} />
        </span>
      </span>
      <span className="station-price">
        <PriceTag price={p} level={level} size="l" />
        {delta != null && Math.abs(delta) >= 0.001 && (
          <span className={`delta ${delta < 0 ? 'neg' : 'pos'}`} title={t('radar.vsAvg', { delta: formatCt(delta, lang) })}>
            {formatCt(delta, lang)}
          </span>
        )}
      </span>
    </Link>
  );
}
