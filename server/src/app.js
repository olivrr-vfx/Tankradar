/**
 * HTTP API (no framework, node:http):
 *   GET /api/health
 *   GET /api/stations?lat=&lng=&rad=      live stations around a point (cached, recorded)
 *   GET /api/stations/:id                  one station (with opening times)
 *   GET /api/prices?ids=a,b,c              current prices for given stations
 *   GET /api/history/:id?fuel=&from=&to=   price changes (step function)
 */
import { createServer } from 'node:http';

const FUELS = new Set(['e5', 'e10', 'diesel']);

export function haversineKm(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Grid key so that nearby requests share one upstream fetch. */
const cellKey = (lat, lng, rad) => `list:${(Math.round(lat * 50) / 50).toFixed(2)}:${(Math.round(lng * 50) / 50).toFixed(2)}:${rad}`;

export function createApp({ db, client, config, log = console }) {
  const buckets = new Map();
  const limited = (ip) => {
    const now = Date.now();
    const b = buckets.get(ip) ?? { n: 0, reset: now + 60000 };
    if (now > b.reset) {
      b.n = 0;
      b.reset = now + 60000;
    }
    b.n++;
    buckets.set(ip, b);
    return b.n > config.rateLimitPerMin;
  };

  async function stationsAround(lat, lng, rad) {
    const radQ = Math.min(25, Math.ceil(rad));
    const key = cellKey(lat, lng, radQ);
    const fresh = Date.now() - db.lastFetch(key) < config.liveCacheSeconds * 1000;
    if (!fresh && client) {
      try {
        const list = await client.list(lat, lng, radQ);
        db.saveStations(list);
        db.markFetch(key);
      } catch (e) {
        log.warn?.('upstream list failed:', e.message);
      }
    }
    const c = { lat, lng };
    return db
      .stationsNear(lat, lng, rad)
      .map((s) => ({ ...s, dist: Math.round(haversineKm(c, s) * 100) / 100 }))
      .filter((s) => s.dist <= rad)
      .sort((a, b) => a.dist - b.dist);
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body, cache = 'no-store') => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': config.corsOrigin,
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': cache,
      });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204, {});
    if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '?';
    if (limited(ip)) return send(429, { error: 'rate limit' });

    const path = url.pathname.replace(/\/+$/, '');
    const q = url.searchParams;

    if (path === '/api/health' || path === '') return send(200, { ok: true, version: '1.0.0', ...db.stats(), regions: config.regions.length });

    if (path === '/api/stations') {
      const lat = Number(q.get('lat'));
      const lng = Number(q.get('lng'));
      const rad = Math.min(25, Math.max(0.5, Number(q.get('rad') ?? 5)));
      if (!q.has('lat') || !q.has('lng') || !Number.isFinite(lat) || !Number.isFinite(lng)) return send(400, { error: 'lat/lng required' });
      return send(200, { stations: await stationsAround(lat, lng, rad) }, 'public, max-age=60');
    }

    const m = /^\/api\/stations\/([^/]+)$/.exec(path);
    if (m) {
      const id = decodeURIComponent(m[1]);
      let st = db.station(id);
      if (client && (!st || st.openingTimes === undefined)) {
        try {
          const d = await client.detail(id);
          db.saveStations([d]);
          st = db.station(id);
        } catch (e) {
          log.warn?.('upstream detail failed:', e.message);
        }
      }
      return send(st ? 200 : 404, { station: st });
    }

    if (path === '/api/prices') {
      const ids = (q.get('ids') ?? '').split(',').filter(Boolean).slice(0, 50);
      const stale = ids.filter((id) => {
        const s = db.station(id);
        return !s || Date.now() - s.updatedAt > config.liveCacheSeconds * 1000;
      });
      if (client && stale.length) {
        try {
          db.savePriceUpdates(await client.prices(stale));
        } catch (e) {
          log.warn?.('upstream prices failed:', e.message);
        }
      }
      const prices = {};
      for (const id of ids) {
        const s = db.station(id);
        if (s) prices[id] = { isOpen: s.isOpen, prices: s.prices };
      }
      return send(200, { prices }, 'public, max-age=60');
    }

    const h = /^\/api\/history\/([^/]+)$/.exec(path);
    if (h) {
      const fuel = q.get('fuel') ?? 'e10';
      if (!FUELS.has(fuel)) return send(400, { error: 'invalid fuel' });
      const to = Number(q.get('to') ?? Date.now());
      const from = Number(q.get('from') ?? to - 7 * 86400000);
      if (!(to > from) || to - from > 400 * 86400000) return send(400, { error: 'invalid range' });
      return send(200, { points: db.history(decodeURIComponent(h[1]), fuel, from, to) }, 'public, max-age=120');
    }

    return send(404, { error: 'not found' });
  }

  return createServer((req, res) => {
    handle(req, res).catch((e) => {
      log.error?.(e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'internal error' }));
    });
  });
}
