// One sector-selection rule for everything that needs sector geometry:
// sector-centre pins (geocode.ts), the pins:osm and pins:import sector checks, and the audit.
//
// Rule for "Sector N" of a project:
//   • candidates = OSM objects named "Sector N" (polygons from the cached Overpass query,
//     points from the geocoder's Nominatim cache)
//   • drop anything outside Gurugram district (Dwarka, Delhi has its own Sector 2/22/24/28…)
//   • Manesar town / IMT Manesar only if the project's text says Manesar, otherwise never
//   • "Part 2" / "Part-II" in the address picks that part if OSM has it (Sector 15-II)
//   • polygons preferred; several parts without a named part are merged
// Locality rule: if the address (or a title/description phrase pairing the sector with
// the place, e.g. "Sector 33 Sohna") names a locality with its own sector numbering, and
// the chosen OSM sector is > 4 km from that locality, the sector is not used.
import { existsSync, readFileSync } from 'node:fs';
import { overpass, type OsmElement } from './overpass.ts';
import { km, pointInEdges, sectorKey, type Edges, type LatLng } from './pinmatch.ts';

const B = '28.15,76.8,28.6,77.2';
export const LOCALITY_CONFLICT_KM = 4;

export interface SectorCand {
  key: string;
  part: string | null;
  osm: string;
  name: string;
  kind: 'polygon' | 'point';
  centre: LatLng; // vertex average (polygons) or the point
  pointCentre: LatLng | null; // Nominatim's centre for the same object, if looked up
  edges: Edges | null;
  inManesar: boolean;
  inDistrict: boolean;
  tehsil: string;
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };
export function partOf(text: string): string | null {
  // A separator is required before the part, so "Sector 15" is never read as Sector 1, Part 5.
  const m =
    text.match(/sector[\s-]*\d+(?!\d)[a-z]?(?:[\s-]*\(\s*part[\s-]*|[\s-]+part[\s-]*|[\s-]+)(i{1,3}|\d)(?!\d)\s*\)?(?=$|[\s,)])/i) ??
    text.match(/\bpart[\s-]*(i{1,3}|\d)\b/i);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return ROMAN[v] ?? v;
}

function edgesOf(e: OsmElement): Edges {
  const edges: Edges = [];
  const add = (g?: { lat: number; lon: number }[]) => {
    if (g) for (let i = 1; i < g.length; i++) edges.push([{ lat: g[i - 1].lat, lng: g[i - 1].lon }, { lat: g[i].lat, lng: g[i].lon }]);
  };
  if (e.type === 'way') add(e.geometry);
  else for (const m of e.members ?? []) if (m.type === 'way' && m.role !== 'subarea') add(m.geometry);
  return edges;
}

/**
 * A point guaranteed inside the polygon: scan a few horizontal lines through it,
 * take the widest interior span and return its midpoint (point-on-surface).
 */
export function pointOnSurface(edges: Edges): LatLng {
  const lats = edges.flatMap(([a, b]) => [a.lat, b.lat]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  let best: { lat: number; lng: number; width: number } | null = null;
  for (const f of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
    const y = minLat + (maxLat - minLat) * f + 1e-9;
    const xs: number[] = [];
    for (const [a, b] of edges)
      if (a.lat > y !== b.lat > y) xs.push(a.lng + ((y - a.lat) / (b.lat - a.lat)) * (b.lng - a.lng));
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1] - xs[i];
      if (!best || width > best.width) best = { lat: y, lng: (xs[i] + xs[i + 1]) / 2, width };
    }
  }
  if (!best) throw new Error('pointOnSurface: degenerate polygon');
  return { lat: best.lat, lng: best.lng };
}

export interface SectorData {
  cands: SectorCand[];
  inManesar: (p: LatLng) => boolean;
  tehsilOf: (p: LatLng) => string;
}

let cached: SectorData | null = null;
export async function loadSectorData(): Promise<SectorData> {
  if (cached) return cached;
  const admin = await overpass(
    'admin-geometry',
    `rel(id:3631133,10398244,10398245,10398246,10398247,10398248);nwr["name"~"^IMT Manesar",i]["landuse"](${B});nwr["name"~"^IMT Manesar",i]["place"](${B});`,
    { out: 'out geom;', timeout: 180 },
  );
  const manesarAreas = admin.filter((e) => e.id === 3631133 || /imt manesar/i.test(e.tags?.name ?? '')).map(edgesOf);
  const tehsils = admin.filter((e) => e.tags?.admin_level === '6').map((e) => ({ name: e.tags!.name, edges: edgesOf(e) }));
  const inManesar = (p: LatLng) => manesarAreas.some((ed) => ed.length > 2 && pointInEdges(p, ed));
  const tehsilOf = (p: LatLng) => tehsils.find((t) => pointInEdges(p, t.edges))?.name ?? '–';

  const polys = await overpass(
    'sector-polygons',
    `rel["name"~"^[Ss]ector[ -]?[0-9]"]["boundary"](${B});rel["name"~"^[Ss]ector[ -]?[0-9]"]["place"](${B});way["name"~"^[Ss]ector[ -]?[0-9]"]["place"](${B});way["name"~"^[Ss]ector[ -]?[0-9]"]["boundary"](${B});`,
    { out: 'out geom;', timeout: 180 },
  );
  const byId = new Map<string, SectorCand>();
  const mk = (base: Omit<SectorCand, 'inManesar' | 'inDistrict' | 'tehsil'>): SectorCand => {
    const t = tehsilOf(base.centre);
    return { ...base, inManesar: inManesar(base.centre), inDistrict: t !== '–', tehsil: t };
  };
  for (const e of polys) {
    const key = sectorKey(e.tags?.name ?? '');
    if (!key) continue;
    if (e.type === 'way') {
      const g = e.geometry;
      if (!g || g.length < 4 || g[0].lat !== g[g.length - 1].lat || g[0].lon !== g[g.length - 1].lon) continue;
    }
    const edges = edgesOf(e);
    if (edges.length < 3) continue;
    const centre = { lat: edges.reduce((s, [a]) => s + a.lat, 0) / edges.length, lng: edges.reduce((s, [a]) => s + a.lng, 0) / edges.length };
    byId.set(`${e.type}/${e.id}`, mk({ key, part: partOf(e.tags!.name), osm: `${e.type}/${e.id}`, name: e.tags!.name, kind: 'polygon', centre, pointCentre: null, edges }));
  }
  const geo: Record<string, { osm_type?: string; osm_id?: number; lat: string; lon: string; name?: string; display_name: string; category?: string }[]> =
    existsSync('data/geocode-cache.json') ? JSON.parse(readFileSync('data/geocode-cache.json', 'utf8')) : {};
  for (const [q, hits] of Object.entries(geo)) {
    if (!/^sector /.test(q)) continue;
    for (const h of hits) {
      const nm = h.name ?? h.display_name.split(',')[0];
      const key = sectorKey(nm);
      if (!key || !h.osm_type || h.category === 'highway') continue;
      const id = `${h.osm_type}/${h.osm_id}`;
      const pt = { lat: +h.lat, lng: +h.lon };
      const ex = byId.get(id);
      if (ex) ex.pointCentre = pt;
      else byId.set(id, mk({ key, part: partOf(nm), osm: id, name: nm, kind: 'point', centre: pt, pointCentre: pt, edges: null }));
    }
  }
  cached = { cands: [...byId.values()], inManesar, tehsilOf };
  return cached;
}

export interface ProjectText {
  sector: string | null;
  address: string | null;
  road: string | null;
  pageTitle: string | null;
  description: string | null;
}

/** Candidates for this project's sector after the rule; `viaParent` for 63A → 63. */
export function chooseSector(data: SectorData, p: ProjectText): { key: string; chosen: SectorCand[]; all: SectorCand[]; viaParent: boolean } | null {
  const key = p.sector?.match(/\d+[A-Z]?/)?.[0];
  if (!key) return null;
  let all = data.cands.filter((c) => c.key === key);
  let viaParent = false;
  if (!all.length && /[A-Z]$/.test(key)) {
    all = data.cands.filter((c) => c.key === key.slice(0, -1));
    viaParent = all.length > 0;
  }
  const saysManesar = /manesar/i.test(`${p.address ?? ''} ${p.road ?? ''} ${p.pageTitle ?? ''}`.replace(/near\s+imt\s+manesar/gi, ''));
  let el = all.filter((c) => c.inDistrict && (saysManesar ? c.inManesar : !c.inManesar));
  const part = partOf(p.address ?? '');
  if (part && el.some((c) => c.part === part)) el = el.filter((c) => c.part === part);
  const polys = el.filter((c) => c.edges);
  return { key, chosen: polys.length ? polys : el.slice(0, 1), all, viaParent };
}

// ───────────── locality rule ─────────────

export interface AreaAliases {
  aliases: Record<string, string>;
  localities: string[];
  notLocalities: string[];
}
export function loadAreaAliases(file = 'data/area-aliases.json'): AreaAliases {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { aliases: {}, localities: [], notLocalities: [] };
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function applyAliases(text: string, a: AreaAliases): string {
  let t = text;
  for (const [from, to] of Object.entries(a.aliases)) t = t.replace(new RegExp(`\\b${esc(from)}\\b`, 'gi'), to);
  return t;
}

/** Remove road / corridor phrases so "Sohna Road" never counts as the locality "Sohna". */
export function stripRoads(text: string, a: AreaAliases): string {
  let t = text;
  for (const r of [...a.notLocalities].sort((x, y) => y.length - x.length)) t = t.replace(new RegExp(`\\b${esc(r)}\\b`, 'gi'), ' ');
  // Generic: "<word> Road/Rd/Expressway/Highway/Marg" and "near <place>"
  t = t.replace(/\bnear\s+[a-z ]+/gi, ' ').replace(/\b[a-z]+(?:\s+[a-z]+)?\s+(road|rd\.?|expressway|highway|marg)\b/gi, ' ');
  return t;
}

export interface LocalityHit {
  locality: string;
  field: 'address' | 'pageTitle' | 'description';
  text: string;
}

/**
 * The locality a project's own text places its sector in. Address first; title or
 * description only when they pair the sector with the locality ("Sector 33 Sohna",
 * "Sohna Sector 33", "Sector 32-33, Sohna").
 */
export function localityFor(p: ProjectText, a: AreaAliases): LocalityHit | null {
  // Every sector number of the project ("Sector 32-33" → 32, 33)
  const nums = p.sector?.match(/\d+/g) ?? [];
  if (!nums.length) return null;
  const n = `(?:${nums.join('|')})`;
  for (const loc of a.localities) {
    const L = esc(loc);
    if (p.address) {
      const t = stripRoads(applyAliases(p.address, a), a);
      if (new RegExp(`\\b${L}\\b`, 'i').test(t)) return { locality: loc, field: 'address', text: p.address };
    }
    for (const field of ['pageTitle', 'description'] as const) {
      const raw = p[field];
      if (!raw) continue;
      const t = stripRoads(applyAliases(raw, a), a);
      // "Sector 33", "Sector 32-33", "Sectors 32 and 33" (one of the project's numbers must appear)
      const sec = `sectors?[\\s-]*(?:\\d+\\s*(?:[-&/,]|and)\\s*)?${n}\\b(?:\\s*(?:[-&/,]|and)\\s*\\d+)?`;
      const m = t.match(new RegExp(`${sec}[\\s,]+(?:in\\s+)?${L}\\b|\\b${L}[\\s,]+${sec}\\b`, 'i'));
      if (m) return { locality: loc, field, text: m[0].replace(/\s+/g, ' ').trim() };
    }
  }
  return null;
}

/** True if the chosen sector geometry is farther than 4 km from the locality point. */
export function localityConflicts(chosen: SectorCand[], localityPoint: LatLng): number | null {
  if (!chosen.length) return null;
  const d = Math.min(...chosen.map((c) => (c.edges && pointInEdges(localityPoint, c.edges) ? 0 : km(localityPoint, c.pointCentre ?? c.centre))));
  return d > LOCALITY_CONFLICT_KM ? d : null;
}
