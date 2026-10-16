import { describe, expect, it } from 'vitest';
import { detourResult } from './Calculator';
import { logStats } from './Logbook';

describe('calculator', () => {
  it('detour worth it', () => {
    const r = detourResult(1.85, 1.75, 40, 4, 6, 0, 0);
    expect(r.priceSaving).toBeCloseTo(4, 5);
    expect(r.net).toBeCloseTo(4 - 0.24 * 1.75, 5);
    expect(r.breakEvenKm).toBeGreaterThan(30);
  });
});

describe('logbook', () => {
  it('full-tank consumption', () => {
    const e = (odometer: number, liters: number, full = true) => ({ id: String(odometer), date: odometer, vehicleId: 'v', stationName: '', fuel: 'e10' as const, liters, pricePerL: 1.8, odometer, full, note: '' });
    const s = logStats([e(1000, 40), e(1500, 30, false), e(1800, 20)]);
    expect(s.consumption).toBeCloseTo((50 / 800) * 100, 5);
    expect(s.spent).toBeCloseTo(90 * 1.8, 5);
  });
});
