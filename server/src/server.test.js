import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { mapStation } from './tankerkoenig.js';

const sample = (e10) => ({ id: 's1', name: 'JET', brand: 'JET', street: 'HAUPTSTR.', houseNumber: '1', postCode: 60311, place: 'FRANKFURT', lat: 50.11, lng: 8.68, e5: 1.8, e10, diesel: 1.6, isOpen: true });

describe('tankradar server', () => {
  const db = openDb(':memory:');
  let calls = 0;
  let e10 = 1.739;
  const client = {
    async list() {
      calls++;
      return [mapStation(sample(e10))];
    },
    async detail() {
      return { ...mapStation(sample(e10)), openingTimes: [{ text: 'Mo-So', start: '06:00:00', end: '22:00:00' }], wholeDay: false };
    },
    async prices() {
      return { s1: { isOpen: true, prices: { e5: 1.8, e10, diesel: 1.6 } } };
    },
  };
  const config = { ...loadConfig({ LIVE_CACHE_SEC: '60' }), liveCacheSeconds: 60 };
  const server = createApp({ db, client, config, log: {} });
  let base = '';
  beforeAll(async () => {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => server.close());

  it('serves and caches stations', async () => {
    const r1 = await (await fetch(`${base}/api/stations?lat=50.11&lng=8.68&rad=5`)).json();
    await fetch(`${base}/api/stations?lat=50.111&lng=8.681&rad=5`);
    expect(r1.stations).toHaveLength(1);
    expect(r1.stations[0].place).toBe('Frankfurt');
    expect(calls).toBe(1);
  });

  it('records only price changes and serves history', async () => {
    db.saveStations([mapStation(sample(1.739))], Date.now() + 1000);
    db.saveStations([mapStation(sample(1.699))], Date.now() + 2000);
    const res = await (await fetch(`${base}/api/history/s1?fuel=e10&from=${Date.now() - 1000}&to=${Date.now() + 5000}`)).json();
    expect(res.points.map((p) => p.p)).toEqual([1.739, 1.699]);
  });

  it('fetches details with opening times', async () => {
    const res = await (await fetch(`${base}/api/stations/s1`)).json();
    expect(res.station.openingTimes).toHaveLength(1);
  });

  it('validates input', async () => {
    expect((await fetch(`${base}/api/stations`)).status).toBe(400);
    expect((await fetch(`${base}/api/history/s1?fuel=lpg`)).status).toBe(400);
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });

  it('parses regions', () => {
    expect(loadConfig({ REGIONS: '50.1,8.6,10; 52.5,13.4' }).regions).toEqual([
      { lat: 50.1, lng: 8.6, rad: 10 },
      { lat: 52.5, lng: 13.4, rad: 10 },
    ]);
  });
});
