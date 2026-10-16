/** Minimal Tankerkönig client used by the collector. */
const num = (v) => (typeof v === 'number' && v > 0 ? v : null);

function title(s = '') {
  if (s !== s.toUpperCase()) return s.trim();
  return s.toLowerCase().replace(/(^|[\s\-/(])([a-zäöüß])/g, (_, a, b) => a + b.toUpperCase()).trim();
}

export function mapStation(s) {
  return {
    id: s.id,
    name: (s.name || s.brand || 'Tankstelle').trim(),
    brand: (s.brand || '').trim(),
    street: title(s.street || ''),
    houseNumber: (s.houseNumber || '').trim(),
    postCode: String(s.postCode ?? '').padStart(5, '0'),
    place: title(s.place || ''),
    lat: s.lat,
    lng: s.lng,
    isOpen: s.isOpen ?? null,
    prices: { e5: num(s.e5), e10: num(s.e10), diesel: num(s.diesel) },
    openingTimes: s.openingTimes,
    wholeDay: s.wholeDay,
  };
}

export function createClient({ apiKey, apiBase, fetchImpl = fetch }) {
  const get = async (path) => {
    const res = await fetchImpl(`${apiBase}/${path}&apikey=${encodeURIComponent(apiKey)}`, { headers: { 'User-Agent': 'tankradar-server/1.0 (+https://github.com/olivrr-vfx/tankradar)' } });
    if (!res.ok) throw new Error(`Tankerkönig HTTP ${res.status}`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.message || 'Tankerkönig error');
    return json;
  };
  return {
    async list(lat, lng, rad) {
      const json = await get(`list.php?lat=${lat}&lng=${lng}&rad=${Math.min(25, rad)}&sort=dist&type=all`);
      return json.stations.map(mapStation);
    },
    async detail(id) {
      const json = await get(`detail.php?id=${encodeURIComponent(id)}`);
      return mapStation(json.station);
    },
    async prices(ids) {
      const out = {};
      for (let i = 0; i < ids.length; i += 10) {
        const json = await get(`prices.php?ids=${ids.slice(i, i + 10).map(encodeURIComponent).join(',')}`);
        for (const [id, p] of Object.entries(json.prices)) {
          out[id] = { isOpen: p.status === 'open' ? true : p.status === 'closed' ? false : null, prices: { e5: num(p.e5), e10: num(p.e10), diesel: num(p.diesel) } };
        }
      }
      return out;
    },
  };
}
