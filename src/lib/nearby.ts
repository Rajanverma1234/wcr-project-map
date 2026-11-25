import type { NearbyItem, Poi, PoiCategory } from '../../shared/types.ts';

export const CATEGORY_META: Record<PoiCategory, { label: string; icon: string; color: string }> = {
  metro: { label: 'Metro', icon: '🚇', color: '#dc2626' },
  railway: { label: 'Railway station', icon: '🚆', color: '#7c2d12' },
  airport: { label: 'Airport', icon: '✈️', color: '#0369a1' },
  mall: { label: 'Mall', icon: '🛍️', color: '#c026d3' },
  hospital: { label: 'Hospital', icon: '🏥', color: '#e11d48' },
  school: { label: 'School', icon: '🏫', color: '#ca8a04' },
  college: { label: 'College / University', icon: '🎓', color: '#4f46e5' },
  park: { label: 'Park', icon: '🌳', color: '#16a34a' },
  bank: { label: 'Bank', icon: '🏦', color: '#0f766e' },
  fuel: { label: 'Petrol pump', icon: '⛽', color: '#475569' },
};
export const CATEGORY_ORDER: PoiCategory[] = ['metro', 'railway', 'airport', 'mall', 'hospital', 'school', 'college', 'park', 'bank', 'fuel'];
export const SUMMARY_CATEGORIES: PoiCategory[] = ['metro', 'mall', 'hospital', 'school', 'airport'];

export interface ProjectNearbyView {
  items: NearbyItem[];
  majorHospital: NearbyItem | null;
}

export interface NearbyData {
  generatedAt: string;
  pois: Poi[];
  poiById: Map<string, Poi>;
  byProject: Map<string, ProjectNearbyView>;
}

type Row = [string, number, number | null, number | null];
type RawNearby = {
  generatedAt: string;
  pois: [string, string, PoiCategory, number, number, 0 | 1][];
  nearby: Record<string, { i: Row[]; m: Row | null }>;
};

export function decodeNearby(raw: RawNearby): NearbyData {
  const pois: Poi[] = raw.pois.map(([id, name, category, lat, lng, major]) => ({
    id,
    name,
    category,
    lat,
    lng,
    source: id.startsWith('manual:') ? 'manual' : 'osm',
    ...(major ? { major: true } : {}),
  }));
  const poiById = new Map(pois.map((p) => [p.id, p]));
  const toItem = ([poiId, straightKm, driveKm, driveMin]: Row): NearbyItem | null => {
    const p = poiById.get(poiId);
    return p
      ? { poiId, name: p.name, category: p.category, lat: p.lat, lng: p.lng, straightKm, driveKm, driveMin, ...(p.major ? { major: true } : {}) }
      : null;
  };
  const byProject = new Map<string, ProjectNearbyView>();
  for (const [slug, { i, m }] of Object.entries(raw.nearby)) {
    byProject.set(slug, {
      items: i.map(toItem).filter((x): x is NearbyItem => x !== null),
      majorHospital: m ? toItem(m) : null,
    });
  }
  return { generatedAt: raw.generatedAt, pois, poiById, byProject };
}

/** "1.2 km · 4 min drive" or "approx 1.2 km (straight line)". */
const kmText = (km: number) => (km < 0.1 ? '< 0.1 km' : `${km} km`);

export function distanceText(it: Pick<NearbyItem, 'straightKm' | 'driveKm' | 'driveMin'>): { text: string; isDrive: boolean } {
  if (it.driveKm !== null && it.driveMin !== null) return { text: `${kmText(it.driveKm)} · ${it.driveMin} min drive`, isDrive: true };
  return { text: `approx ${kmText(it.straightKm)} (straight line)`, isDrive: false };
}

export const DRIVE_NOTE = 'Drive distance and time are approx, without traffic (OpenStreetMap routing).';

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}

export const directionsUrl = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) =>
  `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
