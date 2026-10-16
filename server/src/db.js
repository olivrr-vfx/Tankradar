import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const FUELS = ['e5', 'e10', 'diesel'];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT, brand TEXT, street TEXT, house_number TEXT, post_code TEXT, place TEXT,
      lat REAL NOT NULL, lng REAL NOT NULL,
      is_open INTEGER, e5 REAL, e10 REAL, diesel REAL,
      opening_times TEXT, whole_day INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS stations_geo ON stations(lat, lng);
    CREATE TABLE IF NOT EXISTS prices (
      station_id TEXT NOT NULL,
      fuel TEXT NOT NULL,
      t INTEGER NOT NULL,
      p REAL NOT NULL,
      PRIMARY KEY (station_id, fuel, t)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS fetches (
      key TEXT PRIMARY KEY,
      t INTEGER NOT NULL
    );
  `);

  const upsert = db.prepare(`
    INSERT INTO stations (id, name, brand, street, house_number, post_code, place, lat, lng, is_open, e5, e10, diesel, opening_times, whole_day, updated_at)
    VALUES (:id, :name, :brand, :street, :houseNumber, :postCode, :place, :lat, :lng, :isOpen, :e5, :e10, :diesel, :openingTimes, :wholeDay, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, brand = excluded.brand, street = excluded.street, house_number = excluded.house_number,
      post_code = excluded.post_code, place = excluded.place, lat = excluded.lat, lng = excluded.lng,
      is_open = excluded.is_open, e5 = excluded.e5, e10 = excluded.e10, diesel = excluded.diesel,
      opening_times = COALESCE(excluded.opening_times, stations.opening_times),
      whole_day = COALESCE(excluded.whole_day, stations.whole_day),
      updated_at = excluded.updated_at
  `);
  const updatePrices = db.prepare(`UPDATE stations SET is_open = :isOpen, e5 = :e5, e10 = :e10, diesel = :diesel, updated_at = :updatedAt WHERE id = :id`);
  const lastPrice = db.prepare(`SELECT p FROM prices WHERE station_id = ? AND fuel = ? ORDER BY t DESC LIMIT 1`);
  const insertPrice = db.prepare(`INSERT OR IGNORE INTO prices (station_id, fuel, t, p) VALUES (?, ?, ?, ?)`);
  const near = db.prepare(`SELECT * FROM stations WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`);
  const byId = db.prepare(`SELECT * FROM stations WHERE id = ?`);
  const history = db.prepare(`SELECT t, p FROM prices WHERE station_id = ? AND fuel = ? AND t > ? AND t <= ? ORDER BY t`);
  const before = db.prepare(`SELECT t, p FROM prices WHERE station_id = ? AND fuel = ? AND t <= ? ORDER BY t DESC LIMIT 1`);
  const getFetch = db.prepare(`SELECT t FROM fetches WHERE key = ?`);
  const setFetch = db.prepare(`INSERT INTO fetches (key, t) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET t = excluded.t`);

  /** Record a price only if it differs from the last known one. Returns number of changes. */
  function recordPrices(id, prices, t) {
    let changes = 0;
    for (const fuel of FUELS) {
      const p = prices[fuel];
      if (typeof p !== 'number' || !(p > 0)) continue;
      const last = lastPrice.get(id, fuel);
      if (last && Math.abs(last.p - p) < 1e-6) continue;
      insertPrice.run(id, fuel, t, p);
      changes++;
    }
    return changes;
  }

  const tx = (fn) => {
    db.exec('BEGIN');
    try {
      const r = fn();
      db.exec('COMMIT');
      return r;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  };

  return {
    raw: db,
    saveStations(stations, t = Date.now()) {
      return tx(() => {
        let changes = 0;
        for (const s of stations) {
          upsert.run({
            id: s.id,
            name: s.name ?? '',
            brand: s.brand ?? '',
            street: s.street ?? '',
            houseNumber: s.houseNumber ?? '',
            postCode: s.postCode ?? '',
            place: s.place ?? '',
            lat: s.lat,
            lng: s.lng,
            isOpen: s.isOpen == null ? null : s.isOpen ? 1 : 0,
            e5: s.prices.e5 ?? null,
            e10: s.prices.e10 ?? null,
            diesel: s.prices.diesel ?? null,
            openingTimes: s.openingTimes ? JSON.stringify(s.openingTimes) : null,
            wholeDay: s.wholeDay == null ? null : s.wholeDay ? 1 : 0,
            updatedAt: t,
          });
          changes += recordPrices(s.id, s.prices, t);
        }
        return changes;
      });
    },
    savePriceUpdates(updates, t = Date.now()) {
      return tx(() => {
        let changes = 0;
        for (const [id, u] of Object.entries(updates)) {
          updatePrices.run({ id, isOpen: u.isOpen == null ? null : u.isOpen ? 1 : 0, e5: u.prices.e5 ?? null, e10: u.prices.e10 ?? null, diesel: u.prices.diesel ?? null, updatedAt: t });
          changes += recordPrices(id, u.prices, t);
        }
        return changes;
      });
    },
    stationsNear(lat, lng, radKm) {
      const dLat = radKm / 111;
      const dLng = radKm / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
      return near.all(lat - dLat, lat + dLat, lng - dLng, lng + dLng).map(rowToStation);
    },
    station(id) {
      const r = byId.get(id);
      return r ? rowToStation(r) : null;
    },
    history(id, fuel, from, to) {
      const head = before.get(id, fuel, from);
      const rows = history.all(id, fuel, from, to);
      return head ? [{ t: from, p: head.p }, ...rows] : rows;
    },
    lastFetch(key) {
      return getFetch.get(key)?.t ?? 0;
    },
    markFetch(key, t = Date.now()) {
      setFetch.run(key, t);
    },
    prune(retentionDays) {
      if (!retentionDays) return 0;
      const cutoff = Date.now() - retentionDays * 86400000;
      return Number(db.prepare(`DELETE FROM prices WHERE t < ?`).run(cutoff).changes);
    },
    stats() {
      return {
        stations: db.prepare('SELECT COUNT(*) AS n FROM stations').get().n,
        prices: db.prepare('SELECT COUNT(*) AS n FROM prices').get().n,
        since: db.prepare('SELECT MIN(t) AS t FROM prices').get().t,
      };
    },
    close() {
      db.close();
    },
  };
}

function rowToStation(r) {
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    street: r.street,
    houseNumber: r.house_number,
    postCode: r.post_code,
    place: r.place,
    lat: r.lat,
    lng: r.lng,
    isOpen: r.is_open == null ? null : !!r.is_open,
    prices: { e5: r.e5, e10: r.e10, diesel: r.diesel },
    openingTimes: r.opening_times ? JSON.parse(r.opening_times) : undefined,
    wholeDay: r.whole_day == null ? undefined : !!r.whole_day,
    source: 'server',
    updatedAt: r.updated_at,
  };
}
