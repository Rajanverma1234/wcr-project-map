// Regression tests for the locality rule (scripts/lib/sectorpick.ts).
// Texts are real strings from whitecollarrealty.com project pages (address, title,
// description). Positions: Nominatim/OSM values cached on 2026-11-25.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localityConflicts, localityFor, pointOnSurface, partOf, type AreaAliases, type ProjectText, type SectorCand } from '../scripts/lib/sectorpick.ts';
import { pointInEdges, type Edges } from '../scripts/lib/pinmatch.ts';
import { readFileSync } from 'node:fs';

const aliases: AreaAliases = JSON.parse(readFileSync(new URL('../data/area-aliases.json', import.meta.url), 'utf8'));
const P = (o: Partial<ProjectText>): ProjectText => ({ sector: null, address: null, road: null, pageTitle: null, description: null, ...o });
const loc = (o: Partial<ProjectText>) => localityFor(P(o), aliases)?.locality ?? null;

test('must trigger: locality paired with the sector', () => {
  assert.equal(loc({ sector: 'Sector 32-33', description: 'an ultra-luxury residential project situated in Sectors 32 and 33, Sohna, south of Gurgaon' }), 'Sohna');
  assert.equal(loc({ sector: 'Sector 32-33', pageTitle: 'Central Park Villas Sector 32-33 Sohna, Gurgaon' }), 'Sohna');
  assert.equal(loc({ sector: 'Sector 33', address: 'Sector 33, Sohna, Gurgaon' }), 'Sohna');
  assert.equal(loc({ sector: 'Sector 2', address: 'Sector 2 Gwal Pahari Gurgaon' }), 'Gwal Pahari');
  assert.equal(loc({ sector: 'Sector 2', address: 'Sector 2 Gwal Pahri Gurgaon' }), 'Gwal Pahari'); // website spelling, via alias
});

test('must NOT trigger: roads, corridors and "near X"', () => {
  assert.equal(loc({ sector: 'Sector 48', address: 'Sector 48, Sohna Road' }), null);
  assert.equal(loc({ sector: 'Sector 47 & 49', address: 'Sectors 47 & 49, Sohna Road' }), null);
  assert.equal(loc({ sector: 'Sector 49', address: 'Sector 49, near Sohna' }), null);
  assert.equal(loc({ sector: 'Sector 113', address: 'Sector 113, Dwarka Expressway' }), null);
  assert.equal(loc({ sector: 'Sector 65', address: 'Sector 65, Golf Course Extension Road' }), null);
  assert.equal(loc({ sector: 'Sector 86', address: 'Sector 86, near IMT Manesar' }), null);
  assert.equal(loc({ sector: 'Sector 61', address: 'Sector 61, Gwal Pahari Road' }), null);
  // Title/description: a passing mention without the sector next to it is not enough
  assert.equal(loc({ sector: 'Sector 33', description: 'Easy access to Sohna and the Golf Course Extension Road.' }), null);
});

test('must NOT trigger: description pairs the locality with a sector number the project does not have', () => {
  assert.equal(loc({ sector: 'Sector 65', address: 'Sector 65, Gurgaon', description: 'Close to plots in Sector 33 Sohna and Sector 2 Gwal Pahari.' }), null);
});

test('Badshahpur, Sector 66: locality named but within 4 km of the OSM sector, so no move', () => {
  assert.equal(loc({ sector: 'Sector 66', address: 'Badshahpur, Sector 66, Gurgaon, Haryana 122101' }), 'Badshahpur');
  const s66: SectorCand = {
    key: '66', part: null, osm: 'relation/5810512', name: 'Sector 66', kind: 'point',
    centre: { lat: 28.3976576, lng: 77.0549384 }, pointCentre: { lat: 28.3976576, lng: 77.0549384 },
    edges: null, inManesar: false, inDistrict: true, tehsil: 'Gurugram',
  };
  assert.equal(localityConflicts([s66], { lat: 28.3932757, lng: 77.0484201 }), null); // Badshahpur ≈ 0.8 km
  assert.ok(localityConflicts([s66], { lat: 28.3241636, lng: 77.0848644 })! > 4); // Sohna ≈ 8.7 km → would conflict
});

test('Part parsing for "Sector 15 (Part-2)"', () => {
  assert.equal(partOf('Sector 15 (Part-2), NH-8, Gurugram'), '2');
  assert.equal(partOf('Sector 15-II'), '2');
  assert.equal(partOf('Sector 15-I'), '1');
  assert.equal(partOf('Sector 15, Gurugram'), null);
  assert.equal(partOf('Sector 32-33 Gurgaon'), null); // a range is not a part
});

test('pointOnSurface is inside even for a concave (U-shaped) polygon', () => {
  const p = (lat: number, lng: number) => ({ lat, lng });
  const ring = [p(0, 0), p(0, 3), p(3, 3), p(3, 2), p(1, 2), p(1, 1), p(3, 1), p(3, 0), p(0, 0)];
  const edges: Edges = ring.slice(1).map((b, i) => [ring[i], b]);
  const pt = pointOnSurface(edges);
  assert.equal(pointInEdges(pt, edges), true);
});
