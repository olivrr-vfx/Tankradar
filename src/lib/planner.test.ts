import { describe, expect, it } from 'vitest';
import { planRefuel, type PlanCandidate } from './planner';

const c = (alongKm: number, price: number, detourKm = 0): PlanCandidate<string> => ({ ref: `${alongKm}@${price}`, alongKm, price, detourKm });

describe('planRefuel', () => {
  const base = { tankL: 50, consumption: 10, reserveL: 5, leftoverPrice: 1.8, minRefuelL: 1, stepL: 1 };

  it('needs no stop when the tank lasts', () => {
    const r = planRefuel({ ...base, routeKm: 100, startFuelL: 40, candidates: [c(50, 1.9)] });
    expect(r.feasible).toBe(true);
    expect(r.stops).toHaveLength(0);
  });

  it('is infeasible without reachable stations', () => {
    const r = planRefuel({ ...base, routeKm: 600, startFuelL: 20, candidates: [c(400, 1.7)] });
    expect(r.feasible).toBe(false);
  });

  it('prefers the cheaper station within range', () => {
    // 10 l/100km, start 20 l, reserve 5 → 150 km range. Route 300 km.
    const r = planRefuel({ ...base, routeKm: 300, startFuelL: 20, candidates: [c(50, 1.95), c(120, 1.69), c(140, 1.99)] });
    expect(r.feasible).toBe(true);
    expect(r.stops.map((s) => s.candidate.alongKm)).toEqual([120]);
    // arrive at 120 with 8 l, must reach 300 with ≥5 l → needs ≥ 15 l more; cheap price → fill up
    expect(r.stops[0].liters).toBeGreaterThan(30);
  });

  it('buys only the minimum at an expensive station when a cheap one follows', () => {
    const r = planRefuel({ ...base, routeKm: 400, startFuelL: 10, leftoverPrice: 1.6, candidates: [c(20, 2.1), c(150, 1.6)] });
    expect(r.feasible).toBe(true);
    expect(r.stops.map((s) => s.candidate.alongKm)).toEqual([20, 150]);
    // Must reach km 150 with reserve 5 l: needs 13 l from km 20 → buy little at 2.10
    expect(r.stops[0].liters).toBeLessThan(15);
    expect(r.stops[1].liters).toBeGreaterThan(20);
  });

  it('respects the stop penalty', () => {
    const cands = [c(100, 1.79), c(110, 1.78)];
    const r = planRefuel({ ...base, routeKm: 250, startFuelL: 15, stopPenalty: 5, candidates: cands });
    expect(r.stops).toHaveLength(1);
  });

  it('accounts for detours', () => {
    const r = planRefuel({ ...base, routeKm: 200, startFuelL: 12, candidates: [c(60, 1.7, 60), c(65, 1.75, 0.5)] });
    expect(r.stops[0].candidate.alongKm).toBe(65);
  });
});
