import type { LatLng } from './types';

const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export type NavApp = 'apple' | 'google' | 'waze' | 'osm' | 'geo';

export function googleMapsUrl(dest: LatLng, opts: { origin?: LatLng; waypoints?: LatLng[] } = {}): string {
  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  if (opts.origin) u.searchParams.set('origin', ll(opts.origin));
  u.searchParams.set('destination', ll(dest));
  if (opts.waypoints?.length) u.searchParams.set('waypoints', opts.waypoints.slice(0, 9).map(ll).join('|'));
  u.searchParams.set('travelmode', 'driving');
  return u.toString();
}

export function appleMapsUrl(dest: LatLng, opts: { origin?: LatLng; name?: string } = {}): string {
  const u = new URL('https://maps.apple.com/');
  if (opts.origin) u.searchParams.set('saddr', ll(opts.origin));
  u.searchParams.set('daddr', ll(dest));
  if (opts.name) u.searchParams.set('q', opts.name);
  u.searchParams.set('dirflg', 'd');
  return u.toString();
}

export function wazeUrl(dest: LatLng): string {
  return `https://waze.com/ul?ll=${encodeURIComponent(ll(dest))}&navigate=yes`;
}

export function osmUrl(dest: LatLng, opts: { origin?: LatLng; waypoints?: LatLng[] } = {}): string {
  const pts = [...(opts.origin ? [opts.origin] : []), ...(opts.waypoints ?? []), dest];
  if (pts.length === 1) return `https://www.openstreetmap.org/?mlat=${dest.lat}&mlon=${dest.lng}#map=17/${dest.lat}/${dest.lng}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('%3B')}`;
}

/** Generic Android intent – opens OsmAnd, Organic Maps, Magic Earth, Google Maps … */
export function geoUri(dest: LatLng, name?: string): string {
  const q = name ? `${ll(dest)}(${encodeURIComponent(name)})` : ll(dest);
  return `geo:${ll(dest)}?q=${q}`;
}

export function navUrl(app: NavApp, dest: LatLng, opts: { origin?: LatLng; waypoints?: LatLng[]; name?: string } = {}): string {
  switch (app) {
    case 'apple':
      return appleMapsUrl(dest, opts);
    case 'google':
      return googleMapsUrl(dest, opts);
    case 'waze':
      return wazeUrl(dest);
    case 'osm':
      return osmUrl(dest, opts);
    case 'geo':
      return geoUri(dest, opts.name);
  }
}

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export interface GpxWaypoint extends LatLng {
  name: string;
  desc?: string;
}

/** GPX 1.1 with route track and fuel-stop waypoints – importable in most navigation apps. */
export function buildGpx(name: string, track: [number, number][], waypoints: GpxWaypoint[]): string {
  const wpts = waypoints
    .map((w) => `  <wpt lat="${w.lat}" lon="${w.lng}"><name>${esc(w.name)}</name>${w.desc ? `<desc>${esc(w.desc)}</desc>` : ''}<sym>Gas Station</sym></wpt>`)
    .join('\n');
  const trkpts = track.map(([lng, lat]) => `      <trkpt lat="${lat}" lon="${lng}"/>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Tankradar" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name></metadata>
${wpts}
  <trk><name>${esc(name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>
`;
}

/** iCalendar reminder for a planned fuel stop. */
export function buildIcs(title: string, at: number, location: string, description: string): string {
  const fmt = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const uid = `${at}-${Math.random().toString(36).slice(2)}@tankradar`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tankradar//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(at)}`,
    `DTEND:${fmt(at + 15 * 60_000)}`,
    `SUMMARY:${title.replace(/[,;]/g, ' ')}`,
    `LOCATION:${location.replace(/[,;]/g, ' ')}`,
    `DESCRIPTION:${description.replace(/[,;]/g, ' ').replace(/\n/g, '\\n')}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT10M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Tanken',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
