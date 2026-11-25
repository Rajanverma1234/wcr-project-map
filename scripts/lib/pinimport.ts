// Pure helpers for `npm run pins:import` (unit-tested in tests/pinimport.test.ts).
import { insideSector, type LatLng, type SectorCheck } from './pinmatch.ts';

/** Gurugram + Manesar (same box as pins:osm). */
export const IMPORT_BOUNDS = { minLat: 28.15, maxLat: 28.6, minLng: 76.8, maxLng: 77.2 };

const NUM = String.raw`[-+]?\d+(?:\.\d+)?`;

/**
 * Parse the text Google Maps copies on right-click ("28.4123, 77.0456").
 * Also accepts no space, parentheses, a trailing degree sign, or a semicolon.
 */
export function parseLatLng(text: string): LatLng | null {
  const t = text.trim().replace(/[()°]/g, '').trim();
  const m = t.match(new RegExp(`^(${NUM})\\s*[,;\\s]\\s*(${NUM})$`));
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export type RowCoords = { kind: 'blank' } | { kind: 'error'; reason: string } | { kind: 'ok'; point: LatLng; from: 'lat,lng' | 'latlng' };

/** Coordinates from a CSV row: separate lat + lng columns, or one "latlng" column. */
export function rowCoords(row: Record<string, string | undefined>): RowCoords {
  const lat = (row.lat ?? '').trim();
  const lng = (row.lng ?? '').trim();
  const ll = (row.latlng ?? '').trim();
  if (!lat && !lng && !ll) return { kind: 'blank' };
  if ((lat || lng) && ll) return { kind: 'error', reason: 'both lat/lng and latlng are filled; use one' };
  if (ll) {
    const p = parseLatLng(ll);
    return p ? { kind: 'ok', point: p, from: 'latlng' } : { kind: 'error', reason: `cannot read latlng "${ll}" (expected "28.4123, 77.0456")` };
  }
  if (!lat || !lng) return { kind: 'error', reason: 'only one of lat / lng is filled' };
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return { kind: 'error', reason: `lat/lng are not numbers ("${lat}", "${lng}")` };
  return { kind: 'ok', point: p, from: 'lat,lng' };
}

/** Swapped if the "lat" looks like a Gurugram longitude and vice versa. Rejected, never auto-fixed. */
export function looksSwapped(p: LatLng): boolean {
  return p.lat >= 76 && p.lat <= 78 && p.lng >= 27.5 && p.lng <= 29;
}

/** Bounds and swap check. Returns a rejection reason, or null when fine. */
export function boundsProblem(p: LatLng): string | null {
  if (looksSwapped(p)) return `lat/lng look swapped (${p.lat}, ${p.lng}); Gurugram is lat ≈ 28.x, lng ≈ 76.9–77.2`;
  const b = IMPORT_BOUNDS;
  if (p.lat < b.minLat || p.lat > b.maxLat || p.lng < b.minLng || p.lng > b.maxLng)
    return `outside Gurugram/Manesar bounds (lat ${b.minLat}–${b.maxLat}, lng ${b.minLng}–${b.maxLng})`;
  return null;
}

export type SectorVerdict = 'inside' | 'outside' | 'no-sector';
export function sectorVerdict(p: LatLng, check: SectorCheck | null): SectorVerdict {
  if (!check) return 'no-sector';
  return insideSector(p, check) ? 'inside' : 'outside';
}

export const isConfirmed = (row: Record<string, string | undefined>) => /^(yes|y|true|1)$/i.test((row.confirm ?? '').trim());
