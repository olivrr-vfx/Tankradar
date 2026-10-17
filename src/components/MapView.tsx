import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { splitPrice } from '../i18n/format';
import { useLang } from '../i18n';
import { brandMeta } from '../lib/brands';
import { boundsOf } from '../lib/geo';
import type { PriceLevel } from '../lib/stats';
import type { LatLng } from '../lib/types';
import { drawPin } from './pinImage';

export interface MapPin extends LatLng {
  id: string;
  price: number | null;
  level: PriceLevel;
  closed?: boolean;
  badge?: string;
  title: string;
  brand?: string;
  /** Render as a small dot instead of a price pill (declutter). */
  minor?: boolean;
}

const STYLES = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
  fallback: 'https://tiles.openfreemap.org/styles/liberty',
};

/** Esri World Imagery – free aerial photos (attribution required). */
const SATELLITE_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Minimal local style used when no tile server is reachable (offline): pins and routes still work. */
function offlineStyle(dark: boolean): maplibregl.StyleSpecification {
  return { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#151d2c' : '#e9ecf2' } }] };
}

const LEVEL_COLORS = {
  light: { cheap: '#0e8443', mid: '#a86400', expensive: '#cc2f32', closed: '#b8c0cc' },
  dark: { cheap: '#3ccf7c', mid: '#f0b43c', expensive: '#ff6b6b', closed: '#4a5568' },
};

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

const empty = (): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features: [] });

function lineFeature(coords: [number, number][] | null): GeoJSON.FeatureCollection {
  if (!coords?.length) return empty();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }] };
}

function circleFeature(c: LatLng, km: number): GeoJSON.FeatureCollection {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    pts.push([c.lng + ((km / 111.32) * Math.cos(a)) / Math.cos((c.lat * Math.PI) / 180), c.lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } }] };
}

function pointFeature(p: LatLng | null | undefined): GeoJSON.FeatureCollection {
  if (!p) return empty();
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }] };
}

/**
 * Map with price pins rendered by MapLibre itself (WebGL symbol layer). Pins are part of the
 * map image, so they stay glued to their position while panning/zooming – no DOM markers.
 */
export function MapView({ center, pins, selectedId, onSelect, onMoved, user, route, fitKey, radiusKm, dark }: Props) {
  const lang = useLang();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ready = useRef(false);
  const images = useRef(new Set<string>());
  const [styleVersion, setStyleVersion] = useState(0);
  const [satellite, setSatellite] = useState(() => {
    try {
      return localStorage.getItem('tankradar.satellite') === '1';
    } catch {
      return false;
    }
  });
  const onSelectRef = useRef(onSelect);
  const onMovedRef = useRef(onMoved);
  onSelectRef.current = onSelect;
  onMovedRef.current = onMoved;
  const data = useRef({ route, center, radiusKm, user, satellite });
  data.current = { route, center, radiusKm, user, satellite };

  // Create the map
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
      fadeDuration: 150,
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const fallback = () => {
      if (ready.current || fallbacks > 1) return;
      fallbacks++;
      m.setStyle(fallbacks === 1 && dark ? STYLES.fallback : offlineStyle(dark));
    };
    m.on('error', (e) => {
      if (!m.isStyleLoaded() && /style|404|fetch|network/i.test(String(e.error?.message ?? ''))) fallback();
    });
    const styleTimer = setTimeout(() => {
      if (!ready.current) {
        fallbacks = 2;
        m.setStyle(offlineStyle(dark));
      }
    }, 8000);

    m.on('style.load', () => {
      ready.current = true;
      clearTimeout(styleTimer);
      images.current.clear();
      addLayers(m);
      setStyleVersion((v) => v + 1);
    });

    const pick = (e: maplibregl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (id) onSelectRef.current?.(String(id));
    };
    m.on('click', 'pins', pick);
    m.on('click', 'pin-dots', pick);
    for (const layer of ['pins', 'pin-dots']) {
      m.on('mouseenter', layer, () => (m.getCanvas().style.cursor = 'pointer'));
      m.on('mouseleave', layer, () => (m.getCanvas().style.cursor = ''));
    }
    m.on('moveend', (e) => {
      const c = m.getCenter();
      onMovedRef.current?.({ lat: c.lat, lng: c.lng }, !!(e as { originalEvent?: unknown }).originalEvent);
    });

    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    map.current = m;
    (window as unknown as { __map?: MlMap }).__map = m; // for automated UI tests
    return () => {
      ready.current = false;
      clearTimeout(styleTimer);
      ro.disconnect();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  function addLayers(m: MlMap) {
    const css = getComputedStyle(document.documentElement);
    const brand = css.getPropertyValue('--brand').trim() || '#2f5bff';
    const d = data.current;
    const firstSymbol = m.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
    m.addSource('satellite', { type: 'raster', tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19, attribution: 'Luftbild: Esri, Maxar, Earthstar Geographics' });
    m.addLayer({ id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: d.satellite ? 'visible' : 'none' } }, firstSymbol);
    m.addSource('radius', { type: 'geojson', data: d.center && d.radiusKm ? circleFeature(d.center, d.radiusKm) : empty() });
    m.addSource('route', { type: 'geojson', data: lineFeature(d.route ?? null) });
    m.addSource('user', { type: 'geojson', data: pointFeature(d.user) });
    m.addSource('pins', { type: 'geojson', data: empty() });
    m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': brand, 'fill-opacity': 0.06 } });
    m.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': brand, 'line-opacity': 0.5, 'line-width': 1.5, 'line-dasharray': [2, 2] } });
    m.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.9 } });
    m.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': brand, 'line-width': 5 } });
    m.addLayer({ id: 'user-halo', type: 'circle', source: 'user', paint: { 'circle-radius': 18, 'circle-color': brand, 'circle-opacity': 0.18 } });
    m.addLayer({ id: 'user-dot', type: 'circle', source: 'user', paint: { 'circle-radius': 7, 'circle-color': brand, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
    m.addLayer({
      id: 'pin-dots',
      type: 'circle',
      source: 'pins',
      // every station gets a dot; pills that collide are hidden and the dot remains
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-color': dark ? '#121a29' : '#ffffff',
        'circle-stroke-width': 2,
      },
    });
    m.addLayer({
      id: 'pins',
      type: 'symbol',
      source: 'pins',
      filter: ['!=', ['get', 'minor'], true],
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-anchor': 'bottom',
        // Collision handling: lower sort key = placed first (selected, best prices win).
        'icon-allow-overlap': false,
        'icon-padding': 1,
        'symbol-sort-key': ['get', 'sort'],
      },
    });
  }

  // Pins → GPU images + GeoJSON
  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current || !m.getSource('pins')) return;
    const ratio = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const colors = LEVEL_COLORS[dark ? 'dark' : 'light'];
    const features: GeoJSON.Feature[] = pins.map((p) => {
      const selected = p.id === selectedId;
      const minor = !!p.minor && !selected;
      const sp = splitPrice(p.price, lang) ?? { main: '–', sup: '' };
      const bm = p.brand !== undefined ? brandMeta(p.brand, p.title) : null;
      let icon = '';
      if (!minor) {
        icon = `pin|${dark ? 'd' : 'l'}|${p.level}|${p.closed ? 'c' : 'o'}|${sp.main}${sp.sup}|${bm?.key ?? ''}${bm?.key === 'free' ? bm.mark : ''}|${p.badge ?? ''}|${selected ? 's' : ''}`;
        if (!images.current.has(icon)) {
          const img = drawPin(
            { text: sp.main, sup: sp.sup, level: p.level, closed: !!p.closed, dark, logo: bm ? { bg: bm.bg, fg: bm.fg, mark: bm.mark } : undefined, badge: p.badge, selected },
            ratio,
          );
          if (!m.hasImage(icon)) m.addImage(icon, img.data, { pixelRatio: ratio });
          images.current.add(icon);
        }
      }
      const sort = selected ? 0 : p.badge ? 1 : p.closed ? 9 : p.level === 'cheap' ? 2 : p.level === 'mid' ? 4 : 6;
      return {
        type: 'Feature',
        properties: { id: p.id, icon, minor, sort, color: p.closed ? colors.closed : colors[p.level] },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      };
    });
    (m.getSource('pins') as GeoJSONSource).setData({ type: 'FeatureCollection', features });
  }, [pins, selectedId, lang, dark, styleVersion]);

  // Route (drawn progressively)
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource('route') as GeoJSONSource | undefined;
    if (!m || !ready.current || !src) return;
    if (!route?.length || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      src.setData(lineFeature(route ?? null));
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 1100);
      const e = 1 - (1 - k) ** 3;
      src.setData(lineFeature(route.slice(0, Math.max(2, Math.ceil(route.length * e)))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [route, styleVersion]);

  useEffect(() => {
    const src = map.current?.getSource('radius') as GeoJSONSource | undefined;
    src?.setData(center && radiusKm ? circleFeature(center, radiusKm) : empty());
  }, [center, radiusKm, styleVersion]);

  useEffect(() => {
    (map.current?.getSource('user') as GeoJSONSource | undefined)?.setData(pointFeature(user));
  }, [user, styleVersion]);

  useEffect(() => {
    const m = map.current;
    if (m?.getLayer('satellite')) m.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none');
    try {
      localStorage.setItem('tankradar.satellite', satellite ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [satellite, styleVersion]);

  // Fit view
  useEffect(() => {
    const m = map.current;
    if (!m || fitKey == null) return;
    const pts: LatLng[] = route?.length ? route.map(([lng, lat]) => ({ lat, lng })) : pins.length ? [...pins] : center ? [center] : [];
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
      padding: !narrow
        ? { top: 80, bottom: 60, left: route?.length ? 60 : 460, right: 60 }
        : route?.length
          ? 30
          : { top: 130, bottom: Math.round((el.current?.clientHeight ?? 600) * 0.5), left: 30, right: 30 },
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

  return (
    <div className="map-shell">
      <div ref={el} className="map" />
      <button
        type="button"
        className={`map-layer-btn ${satellite ? 'on' : ''}`}
        onClick={() => setSatellite((s) => !s)}
        aria-pressed={satellite}
        title={satellite ? 'Karte' : 'Satellit'}
      >
        <span className="map-layer-thumb" aria-hidden="true" />
        {satellite ? 'Karte' : 'Satellit'}
      </button>
    </div>
  );
}
