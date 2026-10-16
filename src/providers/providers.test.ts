import { describe, expect, it } from 'vitest';
import { DAY } from '../lib/history';
import { demoHistory, demoStationsAround } from './demo';
import { mapTkStation, titleCase } from './tankerkoenig';

describe('demo provider', () => {
  const c = { lat: 50.11, lng: 8.68 };
  it('is deterministic and realistic', () => {
    const now = Date.now();
    const a = demoStationsAround(c, 10, now);
    const b = demoStationsAround(c, 10, now);
    expect(a.length).toBeGreaterThan(5);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    for (const s of a) {
      expect(s.dist!).toBeLessThanOrEqual(10);
      for (const p of Object.values(s.prices)) {
        expect(p!).toBeGreaterThan(1.3);
        expect(p!).toBeLessThan(2.3);
      }
    }
  });
  it('history is consistent with the current price', () => {
    const now = Date.now();
    const s = demoStationsAround(c, 10, now)[0];
    const h = demoHistory(s.id, 'e10', now - 7 * DAY, now);
    expect(h.length).toBeGreaterThan(30);
    expect(h[h.length - 1].p).toBeCloseTo(s.prices.e10!, 5);
    for (let i = 1; i < h.length; i++) expect(h[i].t).toBeGreaterThanOrEqual(h[i - 1].t);
  });
});

describe('tankerkoenig mapping', () => {
  it('maps list entries', () => {
    const s = mapTkStation({
      id: 'abc',
      name: 'ARAL Tankstelle',
      brand: 'ARAL',
      street: 'HAUPTSTR.',
      houseNumber: '12 ',
      postCode: 1234,
      place: 'BAD HOMBURG V.D. HÖHE',
      lat: 50,
      lng: 8,
      dist: 1.2,
      e5: 1.799,
      e10: false,
      diesel: 1.659,
      isOpen: true,
    });
    expect(s.postCode).toBe('01234');
    expect(s.prices).toEqual({ e5: 1.799, e10: null, diesel: 1.659 });
    expect(s.street).toBe('Hauptstr.');
    expect(s.houseNumber).toBe('12');
  });
  it('titleCase keeps mixed case', () => {
    expect(titleCase('Berliner Straße')).toBe('Berliner Straße');
    expect(titleCase('FRANKFURT AM MAIN')).toBe('Frankfurt Am Main');
  });
});
