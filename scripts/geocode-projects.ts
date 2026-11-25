// Improve project pins by matching project names against OpenStreetMap.
//
//   npm run pins:osm                 dry run (default): report only, changes no pins
//   npm run pins:osm -- --apply      also write data/location-geocoded.json (matched projects only)
//
// Per project (projects with a manual override are skipped for applying):
//   a) Nominatim search, queries in this order:
//        "<name>, Sector <N>, Gurugram, Haryana" → "<name>, Gurugram" → (only if both empty)
//        the name without the developer prefix
//      format=jsonv2, countrycodes=in, addressdetails/namedetails/extratags=1, limit=5,
//      viewbox Gurugram + Manesar, bounded=1. Throttled to 1 request/s, cached per exact
//      query string in data/geocode-cache/nominatim.json.
//   b) If Nominatim has nothing usable: a local search in an OSM "named places" index
//      (named residential/commercial/construction areas, buildings, neighbourhoods),
//      fetched ONCE through the shared Overpass client and cached in data/osm-cache/.
//
// Sector check: OSM polygon named "Sector N" (cached in data/osm-cache/), else a
// 1.5 km circle around the current sector centre. Plus a 2.5 km sanity limit.
//
// Never writes data/location-overrides.json.
// Output: data/geocode-report.md, data/manual-pin-todo.csv, (--apply) data/location-geocoded.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { NominatimClient, type NominatimHit } from './lib/nominatim.ts';
import { overpass, overpassStats, type OsmElement } from './lib/overpass.ts';
import {
  checkName,
  distinctiveTokens,
  insideSector,
  km,
  normalise,
  sectorKey,
  stripDeveloper,
  type Edges,
  type LatLng,
  type SectorCheck,
} from './lib/pinmatch.ts';
import { readCsv } from './lib/csv.ts';
import { BOX, sectorCheckFor } from './lib/sectors.ts';
import { loadSectorData } from './lib/sectorpick.ts';
import type { Project } from '../shared/types.ts';

const APPLY = process.argv.includes('--apply');
const OVERRIDES_FILE = 'data/location-overrides.json';
const GEOCODED_FILE = 'data/location-geocoded.json';
const REPORT_FILE = 'data/geocode-report.md';
const TODO_FILE = 'data/manual-pin-todo.csv';
const MATCH = 0.9;
const MAYBE = 0.75;
const SANITY_KM = 2.5;
const SAME_SITE_KM = 0.3; // same name within 300 m = one site mapped twice (e.g. area + building)
const OVERRIDE_DISAGREE_KM = 0.3;

const readJson = <T>(f: string, fallback: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : fallback);

const nominatim = new NominatimClient('data/geocode-cache/nominatim.json', {
  format: 'jsonv2',
  countrycodes: 'in',
  addressdetails: '1',
  namedetails: '1',
  extratags: '1',
  limit: '5',
  viewbox: `${BOX.west},${BOX.north},${BOX.east},${BOX.south}`,
  bounded: '1',
});

// ───────────── OSM objects as candidates ─────────────

interface Candidate {
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  lat: number;
  lng: number;
  names: string[]; // name, name:en, alt_name, old_name…
  kind: string; // e.g. "landuse=residential"
  siteLike: boolean; // way/relation of a site-type feature → "exact"
  via: 'nominatim' | 'overpass';
  query: string;
}

const SITE_TAGS: [string, RegExp][] = [
  ['landuse', /^(residential|construction|commercial|retail)$/],
  ['building', /.+/],
  ['construction', /.+/],
  ['place', /^(neighbourhood|quarter)$/],
  ['residential', /.+/],
];
const REJECT_CLASS = /^(highway|boundary|railway|waterway|natural|amenity|shop|office|tourism|leisure|healthcare|public_transport)$/;

function kindOf(tags: Record<string, string>): { kind: string; site: boolean } {
  for (const [k, re] of SITE_TAGS) if (tags[k] && re.test(tags[k])) return { kind: `${k}=${tags[k]}`, site: true };
  const first = Object.entries(tags).find(([k]) => /^(amenity|shop|office|tourism|leisure)$/.test(k));
  return { kind: first ? `${first[0]}=${first[1]}` : 'other', site: false };
}

function fromNominatim(h: NominatimHit, query: string): Candidate | null {
  const cls = h.category ?? h.class ?? '';
  if (cls === 'boundary' || cls === 'highway') return null; // a sector/road, not a project
  if (cls === 'place' && !/^(neighbourhood|quarter)$/.test(h.type)) return null;
  const nd = h.namedetails ?? {};
  const names = [nd.name, nd['name:en'], nd.alt_name, nd.old_name, nd.official_name, h.name].filter(Boolean) as string[];
  if (!names.length) return null;
  const tags = { [cls]: h.type, ...(h.extratags ?? {}) };
  const { kind, site: siteByTags } = kindOf(tags); // e.g. a mall that is also mapped as building=yes
  const siteByClass = (cls === 'landuse' && /residential|construction|commercial|retail/.test(h.type)) || cls === 'building' || (cls === 'place' && /neighbourhood|quarter/.test(h.type));
  return {
    osmType: h.osm_type,
    osmId: h.osm_id,
    lat: +h.lat,
    lng: +h.lon,
    names: [...new Set(names)],
    kind: siteByClass ? `${cls}=${h.type}` : kind === 'other' ? `${cls}=${h.type}` : `${cls}=${h.type}, ${kind}`,
    siteLike: (siteByClass || siteByTags) && h.osm_type !== 'node',
    via: 'nominatim',
    query,
  };
}

function fromOverpass(e: OsmElement): Candidate | null {
  const t = e.tags ?? {};
  const names = [t.name, t['name:en'], t.alt_name, t.old_name, t.official_name].filter(Boolean) as string[];
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!names.length || lat === undefined || lng === undefined) return null;
  const { kind, site } = kindOf(t);
  return { osmType: e.type, osmId: e.id, lat, lng, names: [...new Set(names)], kind, siteLike: site && e.type !== 'node', via: 'overpass', query: 'overpass named-places index' };
}

const B = `${BOX.south},${BOX.west},${BOX.north},${BOX.east}`;

// ───────────── main ─────────────

type Status = 'matched' | 'ambiguous' | 'unmatched' | 'skipped-override';
interface Scored extends Candidate {
  name: string;
  score: number;
  allDistinctive: boolean;
  numbersOk: boolean;
  dCentre: number;
  inside: boolean;
  passesName: boolean;
  passesLoc: boolean;
}
interface Result {
  p: Project;
  status: Status;
  check: SectorCheck | null;
  centre: LatLng | null;
  chosen: Scored | null;
  candidates: Scored[];
  why: string;
  queries: string[];
}

const osmLink = (c: { osmType: string; osmId: number }) => `https://www.openstreetmap.org/${c.osmType}/${c.osmId}`;
const gmapsAt = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
const gmapsSearch = (p: Project) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.name} ${p.sector ?? ''} Gurugram`.replace(/\s+/g, ' ').trim())}`;
const fmtKm = (x: number) => (x < 1 ? `${Math.round(x * 1000)} m` : `${x.toFixed(2)} km`);

async function main() {
  const projects = readJson<Project[]>('data/projects.json', []).filter((p) => p.active);
  const overrides = readJson<Record<string, { lat: number; lng: number }>>(OVERRIDES_FILE, {});
  const overridesBefore = existsSync(OVERRIDES_FILE) ? readFileSync(OVERRIDES_FILE, 'utf8') : null;

  console.log(`Mode: ${APPLY ? 'APPLY' : 'dry run'} — ${projects.length} active projects`);
  const sectorData = await loadSectorData();
  // Named-places index for fallback (b): one cached Overpass request for the whole area.
  const index = (
    await overpass(
      'named-places-index',
      [
        `way["landuse"~"^(residential|construction|commercial|retail)$"]["name"](${B})`,
        `relation["landuse"~"^(residential|construction|commercial|retail)$"]["name"](${B})`,
        `nwr["building"]["name"](${B})`,
        `nwr["construction"]["name"](${B})`,
        `nwr["place"~"^(neighbourhood|quarter)$"]["name"](${B})`,
        `nwr["residential"]["name"](${B})`,
      ].join(';') + ';',
      { timeout: 180 },
    )
  )
    .map(fromOverpass)
    .filter((c): c is Candidate => c !== null);
  console.log(`Sector candidates: ${sectorData.cands.length} (${sectorData.cands.filter((c) => c.edges).length} polygons); named-places index: ${index.length}`);

  const results: Result[] = [];
  for (const [i, p] of projects.entries()) {
    const queries: string[] = [];
    // Sector centre (same source as the current pins) and sector check (polygon or 1.5 km radius)
    const n = p.sector?.match(/\d+[A-Z]?/)?.[0] ?? null;
    const { check, centre } = await sectorCheckFor(p);

    // a) Nominatim
    const name = p.name.replace(/\s+/g, ' ').trim();
    const q1 = n ? `${name}, Sector ${n}, Gurugram, Haryana` : null;
    const q2 = `${name}, Gurugram`;
    let raw: { hit: NominatimHit; q: string }[] = [];
    for (const q of [q1, q2].filter(Boolean) as string[]) {
      queries.push(q);
      raw.push(...(await nominatim.search(q)).map((hit) => ({ hit, q })));
    }
    if (!raw.length) {
      const bare = stripDeveloper(name, p.developer);
      if (bare) {
        const q3 = n ? `${bare}, Sector ${n}, Gurugram, Haryana` : `${bare}, Gurugram`;
        queries.push(q3);
        raw = (await nominatim.search(q3)).map((hit) => ({ hit, q: q3 }));
      }
    }
    let cands = raw.map((r) => fromNominatim(r.hit, r.q)).filter((c): c is Candidate => c !== null);

    const score = (c: Candidate): Scored => {
      let best = { name: c.names[0], score: 0, allDistinctive: false, numbersOk: true };
      for (const nm of c.names) {
        const r = checkName(name, p.developer, nm);
        if (r.score > best.score || (r.score === best.score && r.allDistinctive && !best.allDistinctive)) best = { name: nm, ...r };
      }
      const dCentre = centre ? km(centre, c) : Infinity;
      const inside = check ? insideSector(c, check) : false;
      const passesName = best.score >= MATCH && best.allDistinctive && best.numbersOk;
      const passesLoc = inside && dCentre <= SANITY_KM;
      return { ...c, ...best, dCentre, inside, passesName, passesLoc };
    };
    let scored = cands.map(score);
    // b) Overpass named-places index, only if Nominatim gave nothing usable
    if (!scored.some((s) => s.score >= MAYBE)) {
      queries.push('overpass named-places index');
      const dist = distinctiveTokens(name, p.developer);
      cands = index.filter((c) => {
        if (!centre || km(centre, c) > SANITY_KM + 1) return false;
        const t = new Set(c.names.flatMap((x) => normalise(x).split(' ')));
        return dist.length > 0 && dist.some((d) => t.has(d));
      });
      scored = cands.map(score);
    }
    // One entry per OSM object; then merge same-name objects within 300 m into one site.
    const uniq = [...new Map(scored.map((s) => [`${s.osmType}/${s.osmId}`, s])).values()].sort(
      (a, b) => b.score - a.score || Number(b.siteLike) - Number(a.siteLike),
    );
    const sites: Scored[] = [];
    for (const s of uniq) {
      const same = sites.find((k) => normalise(k.name) === normalise(s.name) && km(k, s) <= SAME_SITE_KM);
      if (!same) sites.push(s);
      else if (s.siteLike && !same.siteLike) sites[sites.indexOf(same)] = s;
    }

    let status: Status;
    let chosen: Scored | null = null;
    let why = '';
    const passing = sites.filter((s) => s.passesName && s.passesLoc);
    const nameOnly = sites.filter((s) => s.passesName && !s.passesLoc);
    const midScore = sites.filter((s) => s.passesLoc && s.score >= MAYBE && s.score < MATCH);
    if (overrides[p.slug]) {
      status = 'skipped-override';
      chosen = passing.length === 1 ? passing[0] : null;
      why = 'manual override exists';
    } else if (passing.length === 1) {
      status = 'matched';
      chosen = passing[0];
    } else if (passing.length > 1) {
      status = 'ambiguous';
      why = `${passing.length} distinct OSM objects pass`;
    } else if (nameOnly.length) {
      status = 'ambiguous';
      why = 'name matches but location fails the sector check';
    } else if (midScore.length) {
      status = 'ambiguous';
      why = 'location passes but name score is 0.75–0.90';
    } else if (sites.some((s) => s.score >= MAYBE)) {
      status = 'ambiguous';
      why = 'name similar, but a distinctive word or number is missing';
    } else {
      status = 'unmatched';
      why = sites.length ? 'nothing scores ≥ 0.75' : 'no OSM candidates';
    }
    if (!centre && status === 'matched') {
      status = 'ambiguous';
      why = 'no sector to check against';
      chosen = null;
    }
    results.push({ p, status, check, centre, chosen, candidates: sites.slice(0, 6), why, queries });
    if ((i + 1) % 20 === 0) console.log(`  [${i + 1}/${projects.length}] Nominatim live ${nominatim.live}, cache hits ${nominatim.hits}`);
  }
  nominatim.save();

  // ───────────── outputs ─────────────
  const by = (s: Status) => results.filter((r) => r.status === s);
  const matched = by('matched');
  const ambiguous = by('ambiguous');
  const unmatched = by('unmatched');
  const skipped = by('skipped-override');
  const disagree = skipped.filter((r) => r.chosen && km(r.chosen, overrides[r.p.slug]) > OVERRIDE_DISAGREE_KM);

  const now = new Date().toISOString();
  const geocoded = Object.fromEntries(
    matched.map((r) => [
      r.p.slug,
      {
        lat: +r.chosen!.lat.toFixed(7),
        lng: +r.chosen!.lng.toFixed(7),
        osmType: r.chosen!.osmType,
        osmId: r.chosen!.osmId,
        matchedName: r.chosen!.name,
        score: +r.chosen!.score.toFixed(3),
        accuracy: r.chosen!.siteLike ? 'exact' : 'geocoded',
        query: r.chosen!.query,
        sectorCheck: r.check?.kind === 'polygon' ? `polygon (${r.check.label.replace('polygon ', '')})` : r.check?.label ?? 'none',
        fetchedAt: now,
      },
    ]),
  );
  if (APPLY) writeFileSync(GEOCODED_FILE, JSON.stringify(geocoded, null, 2) + '\n');

  // Marengo Asia / W Pratiksha: candidates only, never coordinates.
  const hospQueries = ['W Pratiksha Hospital, Gurugram', 'Marengo Asia Hospital, Gurugram', 'Pratiksha Hospital, Gurugram'];
  const hospCands: { q: string; h: NominatimHit }[] = [];
  for (const q of hospQueries) for (const h of await nominatim.search(q)) hospCands.push({ q, h });
  const hospCache = readJson<{ elements: OsmElement[] }>('data/osm-cache/hospital.json', { elements: [] });
  const hospOsm = [...hospCache.elements, ...index.map((c) => ({ type: c.osmType, id: c.osmId, lat: c.lat, lon: c.lng, tags: { name: c.names.join(' / ') } }) as OsmElement)].filter((e) =>
    /pratiksha|marengo/i.test(Object.values(e.tags ?? {}).join(' ')),
  );
  nominatim.save();

  const L: string[] = [];
  const sectorChecks = results.filter((r) => r.status !== 'skipped-override');
  L.push(
    '# OSM pin matching report (`npm run pins:osm`)',
    '',
    `- Run: ${now} — mode **${APPLY ? 'APPLY (wrote data/location-geocoded.json)' : 'dry run (no pins changed)'}**`,
    `- Projects: ${results.length}`,
    `- **matched ${matched.length}** · ambiguous ${ambiguous.length} · unmatched ${unmatched.length} · skipped (override) ${skipped.length}`,
    `- Nominatim live requests ${nominatim.live}, cache hits ${nominatim.hits} · Overpass live ${overpassStats.live}, cache ${overpassStats.cached}`,
    `- Sector check used: polygon ${sectorChecks.filter((r) => r.check?.kind === 'polygon').length}, radius ${sectorChecks.filter((r) => r.check?.kind === 'radius').length}, none ${sectorChecks.filter((r) => !r.check).length}`,
    `- Matched accuracy: exact ${matched.filter((r) => r.chosen!.siteLike).length}, geocoded ${matched.filter((r) => !r.chosen!.siteLike).length}`,
    `- data/location-overrides.json: ${overridesBefore === (existsSync(OVERRIDES_FILE) ? readFileSync(OVERRIDES_FILE, 'utf8') : null) ? 'unchanged ✅' : 'CHANGED ❌'}`,
    '',
    `## Matched (${matched.length})`,
    '',
    '| Project | Sector | OSM object | New pin | Moved from sector centre | Score | Accuracy | Sector check |',
    '|---|---|---|---|---|---|---|---|',
    ...matched.map((r) => {
      const c = r.chosen!;
      return `| ${r.p.name} | ${r.p.sector ?? '–'} | [${c.osmType}/${c.osmId}](${osmLink(c)}) "${c.name}" (${c.kind}) | [${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}](${gmapsAt(c.lat, c.lng)}) | ${r.centre ? fmtKm(km(r.centre, c)) : '–'} | ${c.score.toFixed(2)} | ${c.siteLike ? 'exact' : 'geocoded'} | ${r.check?.kind ?? '–'} |`;
    }),
    '',
    `## Ambiguous (${ambiguous.length})`,
    '',
    '| Project | Sector | Candidate | Score | From sector centre | Inside sector | OSM | Why not accepted |',
    '|---|---|---|---|---|---|---|---|',
    ...ambiguous.flatMap((r) =>
      r.candidates
        .filter((c) => c.score >= MAYBE || c.passesName)
        .slice(0, 4)
        .map((c, k) => {
          const reasons: string[] = [];
          if (!c.allDistinctive) reasons.push('distinctive word missing');
          if (!c.numbersOk) reasons.push('number mismatch');
          if (c.score < MATCH) reasons.push(`score < ${MATCH}`);
          if (!c.inside) reasons.push(`outside sector (${r.check?.kind ?? 'no check'})`);
          if (c.dCentre > SANITY_KM) reasons.push(`> ${SANITY_KM} km from centre`);
          if (!reasons.length) reasons.push(r.why);
          return `| ${k ? '' : r.p.name} | ${k ? '' : r.p.sector ?? '–'} | "${c.name}" (${c.kind}) | ${c.score.toFixed(2)} | ${Number.isFinite(c.dCentre) ? fmtKm(c.dCentre) : '–'} | ${c.inside ? 'yes' : 'no'} | [${c.osmType}/${c.osmId}](${osmLink(c)}) | ${reasons.join('; ')} |`;
        }),
    ),
    '',
    `## Unmatched (${unmatched.length})`,
    '',
    '| Project | Sector | Pin it by hand |',
    '|---|---|---|',
    ...unmatched.map((r) => `| ${r.p.name} | ${r.p.sector ?? r.p.address ?? '–'} | [Google Maps search](${gmapsSearch(r.p)}) |`),
    '',
    `## Override disagrees (${disagree.length})`,
    '',
    'OSM has a confident match more than 300 m from the manual override. Nothing was changed. Please double-check.',
    '',
    ...(disagree.length
      ? ['| Project | Override | OSM match | Distance | OSM |', '|---|---|---|---|---|', ...disagree.map((r) => `| ${r.p.name} | ${overrides[r.p.slug].lat}, ${overrides[r.p.slug].lng} | "${r.chosen!.name}" ${r.chosen!.lat.toFixed(5)}, ${r.chosen!.lng.toFixed(5)} | ${fmtKm(km(r.chosen!, overrides[r.p.slug]))} | [${r.chosen!.osmType}/${r.chosen!.osmId}](${osmLink(r.chosen!)}) |`)]
      : ['None.', ...skipped.map((r) => `- ${r.p.name}: override kept${r.chosen ? ` (OSM agrees within ${fmtKm(km(r.chosen, overrides[r.p.slug]))})` : ' (no confident OSM match to compare)'}`)]),
    '',
    '## Hospital candidates for manual verification',
    '',
    'W Pratiksha / Marengo Asia Hospital: OSM was searched; **no coordinates were added**. The entry in data/landmarks-manual.json stays empty until a verified pin is supplied.',
    '',
    ...(hospCands.length || hospOsm.length
      ? [
          '| Source | Name | Type | Location | OSM |',
          '|---|---|---|---|---|',
          ...hospCands.map(({ q, h }) => `| Nominatim "${q}" | ${h.name ?? h.display_name.split(',')[0]} | ${h.category ?? h.class}=${h.type} | ${h.display_name.slice(0, 80)} | [${h.osm_type}/${h.osm_id}](${osmLink({ osmType: h.osm_type, osmId: h.osm_id })}) |`),
          ...hospOsm.map((e) => `| Overpass cache | ${e.tags?.name} | ${e.tags?.amenity ?? e.tags?.building ?? ''} | ${(e.lat ?? e.center?.lat)?.toFixed(5)}, ${(e.lon ?? e.center?.lon)?.toFixed(5)} | [${e.type}/${e.id}](https://www.openstreetmap.org/${e.type}/${e.id}) |`),
        ]
      : [`No OSM object found for: ${hospQueries.map((q) => `"${q}"`).join(', ')}, nor any name containing "Pratiksha" or "Marengo" in the hospital and named-places data.`]),
    '',
  );
  writeFileSync(REPORT_FILE, L.join('\n'));

  // To-do list for hand pinning, sorted by sector (one area at a time). Values already
  // typed into an existing file (lat, lng, latlng, confirm) are kept on re-runs.
  const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const previous = new Map(readCsv(TODO_FILE).map((r) => [r.slug, r]));
  const sectorSort = (s: string | null) => {
    const m = s?.match(/(\d+)([A-Z]?)/);
    return m ? Number(m[1]) * 100 + (m[2] ? m[2].charCodeAt(0) - 64 : 0) : 1e9;
  };
  // Projects pinned only at a locality (Sohna / Gwal Pahari numbering) are furthest from
  // their real site: they go first, then everything else by sector.
  const sources = new Map(
    readJson<{ projects: { slug: string; locationSource: string | null }[] }>('public/data/projects.geo.json', { projects: [] }).projects.map((x) => [x.slug, x.locationSource]),
  );
  const isLocality = (r: Result) => sources.get(r.p.slug) === 'nominatim-locality';
  const todo = [...ambiguous, ...unmatched].sort(
    (a, b) =>
      Number(isLocality(b)) - Number(isLocality(a)) ||
      sectorSort(a.p.sector) - sectorSort(b.p.sector) ||
      (a.p.sector ?? a.p.address ?? '').localeCompare(b.p.sector ?? b.p.address ?? '') ||
      a.p.name.localeCompare(b.p.name),
  );
  writeFileSync(
    TODO_FILE,
    [
      'slug,name,developer,sector,status,google_maps_search_url,lat,lng,latlng,confirm',
      ...todo.map((r) => {
        const old = previous.get(r.p.slug) ?? {};
        return [r.p.slug, r.p.name, r.p.developer ?? '', r.p.sector ?? r.p.address ?? '', isLocality(r) ? `${r.status}; pinned at locality only (pin first)` : r.status, gmapsSearch(r.p), old.lat ?? '', old.lng ?? '', old.latlng ?? '', old.confirm ?? '']
          .map(csv)
          .join(',');
      }),
    ].join('\n') + '\n',
  );

  if (overridesBefore !== (existsSync(OVERRIDES_FILE) ? readFileSync(OVERRIDES_FILE, 'utf8') : null)) throw new Error('location-overrides.json changed — this must never happen');
  console.log(L.slice(2, 9).join('\n'));
  console.log(`Wrote ${REPORT_FILE}, ${TODO_FILE}${APPLY ? `, ${GEOCODED_FILE} (${matched.length})` : ''}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
