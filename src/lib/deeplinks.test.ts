import { describe, expect, it } from 'vitest';
import { appleMapsUrl, buildGpx, buildIcs, geoUri, googleMapsUrl, wazeUrl } from './deeplinks';

describe('deeplinks', () => {
  const d = { lat: 50.1, lng: 8.6 };
  it('google with waypoints', () => {
    const u = new URL(googleMapsUrl(d, { origin: { lat: 52, lng: 13 }, waypoints: [{ lat: 51, lng: 10 }] }));
    expect(u.searchParams.get('destination')).toBe('50.100000,8.600000');
    expect(u.searchParams.get('waypoints')).toBe('51.000000,10.000000');
    expect(u.searchParams.get('api')).toBe('1');
  });
  it('apple / waze / geo', () => {
    expect(appleMapsUrl(d)).toContain('daddr=50.100000%2C8.600000');
    expect(wazeUrl(d)).toContain('navigate=yes');
    expect(geoUri(d, 'Aral')).toBe('geo:50.100000,8.600000?q=50.100000,8.600000(Aral)');
  });
  it('gpx + ics', () => {
    const g = buildGpx('A & B', [[8, 50], [9, 51]], [{ lat: 50, lng: 8, name: '1. <Shell>' }]);
    expect(g).toContain('&lt;Shell&gt;');
    expect(g).toContain('<trkpt lat="51" lon="9"/>');
    expect(buildIcs('Tanken', Date.UTC(2026, 0, 1, 18), 'X', 'Y')).toContain('DTSTART:20260101T180000Z');
  });
});
