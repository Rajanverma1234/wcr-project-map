// Sector check shared by pins:osm and pins:import. It is the SAME rule that places
// sector-centre pins (sectorPinFor in geocode.ts → scripts/lib/sectorpick.ts), so the
// three always agree:
//   • polygon of the chosen OSM sector (Gurugram district; Manesar only if the project
//     says so; "Part 2" → Sector N-II), else a 1.5 km circle around the sector point
//   • projects whose text puts the sector in Sohna / Gwal Pahari (other numbering):
//     a 4 km circle around that locality
import { sectorPinFor } from '../geocode.ts';
import type { LatLng, SectorCheck } from './pinmatch.ts';
import type { ProjectText } from './sectorpick.ts';

export const BOX = { south: 28.15, west: 76.8, north: 28.6, east: 77.2 }; // Gurugram + Manesar
export const RADIUS_KM = 1.5;

export async function sectorCheckFor(p: ProjectText): Promise<{ check: SectorCheck | null; centre: LatLng | null }> {
  const sp = await sectorPinFor(p);
  return { check: sp?.check ?? null, centre: sp?.centre ?? null };
}
