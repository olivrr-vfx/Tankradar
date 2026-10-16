import { describe, expect, it } from 'vitest';
import { dailyAggregates, DAY, DEFAULT_PROFILE, HOUR, hourlyProfile, mergePoints, nextCheapWindow, predictPrice, startOfDay, valueAt } from './history';

describe('history', () => {
  it('default profile is centred and cheapest in the evening', () => {
    expect(Math.abs(DEFAULT_PROFILE.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
    const min = DEFAULT_PROFILE.indexOf(Math.min(...DEFAULT_PROFILE));
    expect(min).toBeGreaterThanOrEqual(18);
    expect(min).toBeLessThanOrEqual(21);
  });

  it('valueAt follows the step function', () => {
    const pts = [
      { t: 10, p: 1 },
      { t: 20, p: 2 },
      { t: 30, p: 3 },
    ];
    expect(valueAt(pts, 5)).toBeNull();
    expect(valueAt(pts, 10)).toBe(1);
    expect(valueAt(pts, 25)).toBe(2);
    expect(valueAt(pts, 99)).toBe(3);
  });

  it('mergePoints dedupes and sorts', () => {
    const m = mergePoints([{ t: 3, p: 1 }, { t: 1, p: 1 }], [{ t: 2, p: 1 }, { t: 4, p: 2 }]);
    expect(m).toEqual([
      { t: 1, p: 1 },
      { t: 4, p: 2 },
    ]);
  });

  it('learns an hour profile from synthetic history', () => {
    const now = startOfDay(Date.now()) + 12 * HOUR;
    const pts = [];
    for (let d = 10; d >= 0; d--) {
      const day = startOfDay(now - d * DAY);
      for (let h = 0; h < 24; h++) pts.push({ t: day + h * HOUR, p: 1.8 + (h === 19 ? -0.1 : h === 7 ? 0.1 : 0) });
    }
    const prof = hourlyProfile(pts, now, 7)!;
    expect(prof.days).toBe(7);
    expect(prof.deltas[19]).toBeLessThan(-0.09);
    expect(prof.deltas[7]).toBeGreaterThan(0.09);
    const target = startOfDay(now) + 19 * HOUR + 10 * 60000;
    expect(predictPrice(1.8, startOfDay(now) + 12 * HOUR, target, prof)).toBeCloseTo(1.7, 2);
    const w = nextCheapWindow(startOfDay(now) + 12 * HOUR, prof, 12);
    expect(new Date(w.at).getHours()).toBe(19);
  });

  it('computes daily aggregates', () => {
    const day = startOfDay(Date.now() - 3 * DAY);
    const pts = [
      { t: day, p: 1.8 },
      { t: day + 12 * HOUR, p: 1.6 },
    ];
    const agg = dailyAggregates(pts, day, day + DAY);
    expect(agg).toHaveLength(1);
    expect(agg[0].min).toBeCloseTo(1.6);
    expect(agg[0].max).toBeCloseTo(1.8);
    expect(agg[0].avg).toBeCloseTo(1.7, 2);
  });
});
