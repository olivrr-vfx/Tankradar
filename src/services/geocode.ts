import type { LatLng } from '../lib/types';
import { getJson } from './http';

export interface Place extends LatLng {
  label: string;
  detail: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    district?: string;
    state?: string;
    country?: string;
    countrycode?: string;
  };
}

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const streetLine = [p.street, p.housenumber].filter(Boolean).join(' ');
  const label = p.name || streetLine || p.city || 'Ort';
  const detail = [p.name && streetLine ? streetLine : '', [p.postcode, p.city].filter(Boolean).join(' '), p.country]
    .filter((x) => x && x !== label)
    .join(', ');
  return { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], label, detail };
}

export async function searchPlaces(q: string, near?: LatLng, lang = 'de'): Promise<Place[]> {
  if (q.trim().length < 2) return [];
  const coords = /^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
  if (coords) {
    const lat = Number(coords[1]);
    const lng = Number(coords[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return [{ lat, lng, label: `${lat}, ${lng}`, detail: 'Koordinaten' }];
  }
  const bias = near ? `&lat=${near.lat.toFixed(3)}&lon=${near.lng.toFixed(3)}` : '';
  try {
    const res = await getJson<{ features: PhotonFeature[] }>(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=${lang === 'de' ? 'de' : 'en'}${bias}`,
    );
    return res.features.map(toPlace);
  } catch {
    const res = await getJson<{ lat: string; lon: string; display_name: string; name?: string }[]>(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`,
    );
    return res.map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: r.name || r.display_name.split(',')[0],
      detail: r.display_name.split(',').slice(1, 4).join(',').trim(),
    }));
  }
}

export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const res = await getJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/reverse?lat=${p.lat}&lon=${p.lng}&limit=1`);
    const f = res.features[0];
    if (!f) return null;
    const pr = f.properties;
    return [pr.city || pr.district || pr.name, pr.postcode].filter(Boolean).join(' ') || null;
  } catch {
    return null;
  }
}
