import { describe, expect, it } from 'vitest';
import { cumulativeKm, haversineKm, pointAlong, projectOnRoute, sampleAlong } from './geo';

describe('geo', () => {
  it('haversine Berlin–Munich ≈ 504 km', () => {
    expect(haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.137, lng: 11.575 })).toBeGreaterThan(500);
    expect(haversineKm({ lat: 52.52, lng: 13.405 }, { lat: 48.137, lng: 11.575 })).toBeLessThan(510);
  });
  const line: [number, number][] = [
    [8, 50],
    [9, 50],
    [10, 50],
  ];
  const cum = cumulativeKm(line);
  it('cumulative km', () => {
    expect(cum[2]).toBeCloseTo(2 * 71.5, 0);
  });
  it('projects points', () => {
    const p = projectOnRoute({ lat: 50.05, lng: 9 }, line, cum);
    expect(p.alongKm).toBeCloseTo(cum[1], 0);
    expect(p.offKm).toBeCloseTo(5.56, 1);
  });
  it('samples along', () => {
    const s = sampleAlong(line, cum, 20);
    expect(s.length).toBeGreaterThanOrEqual(8);
    expect(pointAlong(line, cum, cum[2] / 2).lng).toBeCloseTo(9, 3);
  });
});
