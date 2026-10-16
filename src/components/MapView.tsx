import maplibregl, { type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import { splitPrice } from '../i18n/format';
import { useLang } from '../i18n';
import { boundsOf } from '../lib/geo';
import type { PriceLevel } from '../lib/stats';
import type { LatLng } from '../lib/types';

export interface MapPin extends LatLng {
  id: string;
  price: number | null;
  level: PriceLevel;
  closed?: boolean;
  badge?: string;
  title: string;
  /** Render as a small dot instead of a price pill (declutter). */
  minor?: boolean;
}

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fallback: 'https://tiles.openfreemap.org/styles/liberty',
};

/** Minimal local style used when no tile server is reachable (offline): pins and routes still work. */
function offlineStyle(dark: boolean): maplibregl.StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#151d2c' : '#e9ecf2' } }] };
}

interface Props {
  center: LatLng | null;
  pins: MapPin[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onMoved?: (center: LatLng, byUser: boolean) => void;
  user?: LatLng | null;
  route?: [number, number][] | null;
  /** Fit the view to pins/route whenever this key changes. */
  fitKey?: string | number;
  radiusKm?: number;
  dark: boolean;
}

export function MapView({ center, pins, selectedId, onSelect, onMoved, user, route, fitKey, radiusKm, dark }: Props) {
  const lang = useLang();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const userMarker = useRef<Marker | null>(null);
  const ready = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onMovedRef = useRef(onMoved);
  onSelectRef.current = onSelect;
  onMovedRef.current = onMoved;

  // Create map
  useEffect(() => {
    if (!el.current) return;
    let fallbacks = 0;
    const m = new maplibregl.Map({
      container: el.current,
      style: dark ? STYLES.dark : STYLES.light,
      center: center ? [center.lng, center.lat] : [10.45, 51.16],
      zoom: center ? 12 : 5.3,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    const onStyleError = () => {
      if (ready.current || fallbacks > 1) return;
      fallbacks++;
      m.setStyle(fallbacks === 1 && dark ? STYLES.fallback : offlineStyle(dark));
    };
    m.on('error', (e) => {
      if (!m.isStyleLoaded() && /style|404|fetch|network/i.test(String(e.error?.message ?? ''))) onStyleError();
    });
    // Do not wait forever for a slow/blocked style server.
    const styleTimer = setTimeout(() => !ready.current && (fallbacks = 1, m.setStyle(offlineStyle(dark))), 8000);
    m.on('style.load', () => {
      ready.current = true;
      clearTimeout(styleTimer);
      addOverlays(m);
    });
    m.on('moveend', (e) => {
      const c = m.getCenter();
      onMovedRef.current?.({ lat: c.lat, lng: c.lng }, !!(e as { originalEvent?: unknown }).originalEvent);
    });
    map.current = m;
    // Keep the map in sync with its container (panels, sheets and grid rows change size).
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    const mk = markers.current;
    return () => {
      ready.current = false;
      clearTimeout(styleTimer);
      ro.disconnect();
      mk.clear();
      userMarker.current = null;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  // Overlays (route + radius) need the style to be loaded
  const overlayData = useRef<{ route: [number, number][] | null; circle: GeoJSON.Feature | null }>({ route: null, circle: null });
  overlayData.current.route = route ?? null;
  overlayData.current.circle = center && radiusKm ? circleFeature(center, radiusKm) : null;

  function addOverlays(m: MlMap) {
    if (!m.getSource('route')) {
      m.addSource('route', { type: 'geojson', data: lineFeature(overlayData.current.route) });
      m.addSource('radius', { type: 'geojson', data: overlayData.current.circle ?? emptyFC() });
      const css = getComputedStyle(document.documentElement);
      const brand = css.getPropertyValue('--brand').trim() || '#2f5bff';
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': brand, 'fill-opacity': 0.05 } });
      m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': brand, 'line-opacity': 0.4, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
      m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 } });
      m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': brand, 'line-width': 5 } });
    }
  }

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('route') as maplibregl.GeoJSONSource | undefined)?.setData(lineFeature(route ?? null));
  }, [route]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    (m.getSource('radius') as maplibregl.GeoJSONSource | undefined)?.setData(center && radiusKm ? circleFeature(center, radiusKm) : emptyFC());
  }, [center, radiusKm]);

  // Pins
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const keep = new Set(pins.map((p) => p.id));
    for (const [id, mk] of markers.current) {
      if (!keep.has(id)) {
        mk.remove();
        markers.current.delete(id);
      }
    }
    for (const p of pins) {
      const sp = splitPrice(p.price, lang);
      const minor = p.minor && p.id !== selectedId;
      const html = minor ? '' : `${p.badge ? `<span class="pin-badge">${p.badge}</span>` : ''}${sp ? `${sp.main}<sup>${sp.sup}</sup>` : '–'}`;
      const cls = `pin lvl-${p.level}${minor ? ' pin-dot' : ''}${p.closed ? ' closed' : ''}${p.id === selectedId ? ' selected' : ''}`;
      let mk = markers.current.get(p.id);
      if (!mk) {
        const node = document.createElement('button');
        node.type = 'button';
        node.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectRef.current?.(p.id);
        });
        mk = new maplibregl.Marker({ element: node, anchor: p.minor ? 'center' : 'bottom' }).setLngLat([p.lng, p.lat]).addTo(m);
        // Remember MapLibre's own classes (positioning!) so we never overwrite them.
        node.dataset.base = node.className;
        markers.current.set(p.id, mk);
      }
      const node = mk.getElement();
      node.className = `${node.dataset.base ?? ''} ${cls}`;
      node.innerHTML = html;
      node.title = p.title;
      node.setAttribute('aria-label', `${p.title}: ${sp ? sp.main + sp.sup : '–'} €`);
      node.style.zIndex = p.id === selectedId ? '10' : minor ? '0' : p.badge ? '5' : p.level === 'cheap' ? '3' : '1';
    }
  }, [pins, selectedId, lang]);

  // User position
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!user) {
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!userMarker.current) {
      const node = document.createElement('div');
      node.className = 'user-dot';
      userMarker.current = new maplibregl.Marker({ element: node }).setLngLat([user.lng, user.lat]).addTo(m);
    } else userMarker.current.setLngLat([user.lng, user.lat]);
  }, [user]);

  // Fit view
  useEffect(() => {
    const m = map.current;
    if (!m || fitKey == null) return;
    const pts: LatLng[] = route?.length
      ? route.map(([lng, lat]) => ({ lat, lng }))
      : pins.length
        ? pins
        : center
          ? [center]
          : [];
    if (center && !route?.length) {
      pts.push(center);
      if (radiusKm) {
        const dLat = radiusKm / 111;
        const dLng = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
        pts.push({ lat: center.lat + dLat, lng: center.lng + dLng }, { lat: center.lat - dLat, lng: center.lng - dLng });
      }
    }
    const b = boundsOf(pts);
    if (!b) return;
    m.resize();
    const narrow = (el.current?.clientWidth ?? 800) < 700;
    m.fitBounds(b, {
      padding: !narrow ? { top: 80, bottom: 60, left: route?.length ? 60 : 460, right: 60 } : route?.length ? 30 : { top: 130, bottom: Math.round((el.current?.clientHeight ?? 600) * 0.5), left: 30, right: 30 },
      maxZoom: 14,
      duration: 600,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Pan to the selected pin if it is off-screen
  useEffect(() => {
    const m = map.current;
    const p = pins.find((x) => x.id === selectedId);
    if (!m || !p) return;
    if (!m.getBounds().contains([p.lng, p.lat])) m.easeTo({ center: [p.lng, p.lat], duration: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return <div ref={el} className="map" />;
}

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] };
}

function lineFeature(coords: [number, number][] | null): GeoJSON.FeatureCollection {
  if (!coords?.length) return emptyFC();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] };
}

function circleFeature(c: LatLng, km: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([c.lng + ((km / 111.32) * Math.cos(a)) / Math.cos((c.lat * Math.PI) / 180), c.lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}
