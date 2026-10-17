import { useLayoutEffect, useRef, useState } from 'react';
import type { LatLng } from '../lib/types';

const TILE = 256;
const URL = (z: number, x: number, y: number) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

function worldPx(p: LatLng, z: number) {
  const n = TILE * 2 ** z;
  const x = ((p.lng + 180) / 360) * n;
  const s = Math.sin((p.lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return { x, y };
}

/** Real aerial photo of the station (Esri World Imagery tiles), centred on its position. */
export function AerialView({ point, zoom = 19, onLoad }: { point: LatLng; zoom?: number; onLoad?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const loaded = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Slightly zoom in on big screens so the station fills the frame.
  const scale = size.w > 900 ? 1.25 : 1;
  const w = size.w / scale;
  const h = size.h / scale;
  const c = worldPx(point, zoom);
  const left = c.x - w / 2;
  const top = c.y - h / 2;
  const tiles: { x: number; y: number }[] = [];
  if (w > 0) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++)
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) tiles.push({ x: tx, y: ty });
  }
  return (
    <div ref={ref} className="aerial">
      <div className="aerial-inner" style={{ width: w, height: h, transform: `scale(${scale})` }}>
        {tiles.map((t) => (
          <img
            key={`${t.x}-${t.y}`}
            src={URL(zoom, t.x, t.y)}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            style={{ left: t.x * TILE - left, top: t.y * TILE - top }}
            onLoad={() => {
              loaded.current++;
              if (loaded.current === 1) onLoad?.();
            }}
          />
        ))}
      </div>
      <span className="aerial-marker" aria-hidden="true" />
    </div>
  );
}
