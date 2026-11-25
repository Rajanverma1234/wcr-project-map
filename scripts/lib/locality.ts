// Locality positions (Nominatim, cached) and the per-project locality decision.
import { NominatimClient } from './nominatim.ts';
import { chooseSector, localityConflicts, localityFor, type AreaAliases, type ProjectText, type SectorData } from './sectorpick.ts';
import type { LatLng } from './pinmatch.ts';

const nom = new NominatimClient('data/geocode-cache/nominatim.json', { format: 'jsonv2', countrycodes: 'in', limit: '3' });
const points = new Map<string, LatLng | null>();

export async function localityPoint(locality: string): Promise<LatLng | null> {
  if (points.has(locality)) return points.get(locality)!;
  const hit = (await nom.search(`${locality}, Gurugram, Haryana`)).find((h) => +h.lat > 28.1 && +h.lat < 28.65 && +h.lon > 76.7 && +h.lon < 77.3);
  const p = hit ? { lat: +hit.lat, lng: +hit.lon } : null;
  points.set(locality, p);
  nom.save();
  return p;
}

export interface LocalityDecision {
  locality: string;
  field: string;
  text: string;
  point: LatLng;
  distanceKm: number; // from the chosen OSM sector
}

/** Non-null when the project's sector must not be used because its text puts it in another locality. */
export async function localityOverride(p: ProjectText, data: SectorData, aliases: AreaAliases): Promise<LocalityDecision | null> {
  const hit = localityFor(p, aliases);
  if (!hit) return null;
  const pick = chooseSector(data, p);
  const point = await localityPoint(hit.locality);
  if (!pick || !point) return null;
  const d = localityConflicts(pick.chosen, point);
  return d === null ? null : { ...hit, point, distanceKm: d };
}
