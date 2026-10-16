/**
 * Exterior photos of a station from open sources:
 *  1. Mapillary street-level imagery (CC BY-SA) – needs a free client token (settings)
 *  2. Wikimedia Commons geotagged photos (free licences) – filtered to fuel-station motifs
 */
import { haversineKm } from '../lib/geo';
import type { LatLng } from '../lib/types';
import { getJson } from './http';

export interface StationPhoto {
  url: string;
  credit: string;
  license: string;
  link: string;
  source: 'mapillary' | 'commons';
}

const cache = new Map<string, Promise<StationPhoto | null>>();

const bearing = (a: LatLng, b: LatLng) => {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

interface MlyImage {
  id: string;
  thumb_1024_url?: string;
  computed_geometry?: { coordinates: [number, number] };
  geometry?: { coordinates: [number, number] };
  compass_angle?: number;
  computed_compass_angle?: number;
  captured_at?: number;
  creator?: { username?: string };
}

async function fromMapillary(p: LatLng, token: string): Promise<StationPhoto | null> {
  const d = 0.0009; // ~100 m
  const bbox = [p.lng - d * 1.5, p.lat - d, p.lng + d * 1.5, p.lat + d].map((x) => x.toFixed(6)).join(',');
  const res = await getJson<{ data: MlyImage[] }>(
    `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}&fields=id,thumb_1024_url,computed_geometry,geometry,compass_angle,computed_compass_angle,captured_at,creator&bbox=${bbox}&limit=60`,
  );
  let best: { img: MlyImage; score: number } | null = null;
  for (const img of res.data ?? []) {
    const c = img.computed_geometry?.coordinates ?? img.geometry?.coordinates;
    if (!c || !img.thumb_1024_url) continue;
    const cam = { lng: c[0], lat: c[1] };
    const dist = haversineKm(cam, p) * 1000;
    if (dist < 8 || dist > 90) continue;
    const heading = img.computed_compass_angle ?? img.compass_angle;
    const off = heading == null ? 90 : angleDiff(heading, bearing(cam, p));
    if (off > 55) continue; // camera must look at the station
    const ageYears = img.captured_at ? (Date.now() - img.captured_at) / 3.15e10 : 5;
    const score = off * 1.2 + Math.abs(dist - 35) * 0.6 + ageYears * 6;
    if (!best || score < best.score) best = { img, score };
  }
  if (!best) return null;
  return {
    url: best.img.thumb_1024_url!,
    credit: best.img.creator?.username ? `© ${best.img.creator.username} / Mapillary` : '© Mapillary',
    license: 'CC BY-SA 4.0',
    link: `https://www.mapillary.com/app/?pKey=${best.img.id}&focus=photo`,
    source: 'mapillary',
  };
}

interface CommonsPage {
  title: string;
  imageinfo?: { thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[];
}

const MOTIF = /tank|fuel|petrol|gas[ _-]?station|filling|benzin|aral|shell|esso|total|avia|\bjet\b|agip|\beni\b|\bomv\b|\bbp\b|star|westfalen|raiffeisen|hem\b|bft/i;
const stripHtml = (s = '') => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function fromCommons(p: LatLng): Promise<StationPhoto | null> {
  const res = await getJson<{ query?: { pages?: Record<string, CommonsPage> } }>(
    `https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=${p.lat}%7C${p.lng}&ggsradius=120&ggsnamespace=6&ggslimit=20&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1024&format=json&origin=*`,
  );
  const pages = Object.values(res.query?.pages ?? {}).filter((pg) => MOTIF.test(pg.title) && pg.imageinfo?.[0]?.thumburl);
  const pg = pages[0];
  if (!pg) return null;
  const info = pg.imageinfo![0];
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl!,
    credit: stripHtml(meta.Artist?.value) || 'Wikimedia Commons',
    license: stripHtml(meta.LicenseShortName?.value) || 'Wikimedia Commons',
    link: info.descriptionurl ?? 'https://commons.wikimedia.org',
    source: 'commons',
  };
}

export function findStationPhoto(id: string, p: LatLng, mapillaryToken: string): Promise<StationPhoto | null> {
  const key = `${id}|${mapillaryToken ? 'm' : ''}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      if (mapillaryToken) {
        const m = await fromMapillary(p, mapillaryToken).catch(() => null);
        if (m) return m;
      }
      return fromCommons(p).catch(() => null);
    })();
    cache.set(key, hit);
  }
  return hit;
}

/** Google Street View at the station (free deep link, no API key). */
export const streetViewUrl = (p: LatLng) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
