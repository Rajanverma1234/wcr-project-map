// Give every scraped project a map position.
//
// Priority (first that works wins):
//   0. data/location-overrides.json  (manual; always wins)            → "exact", source "override"
//   1. coordinates embedded in the project page                       → "exact"
//   1b. data/location-geocoded.json (strict OSM name match, `npm run pins:osm -- --apply`)
//                                                                     → "exact" | "geocoded", source "osm-name"
//   3. Nominatim centre of the project's sector                       → "sector-approx"
//   4. Nominatim centre of the road/area named in the address          → "sector-approx"
//
// Nominatim policy: max 1 request/second, identifying User-Agent, results cached
// in data/geocode-cache.json so re-runs only query new addresses.
//
// Output: public/data/projects.geo.json (what the map loads), data/geocode-report.md
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { USER_AGENT } from './lib/http.ts';
import { NominatimClient } from './lib/nominatim.ts';
import { applyAliases, chooseSector, loadAreaAliases, loadSectorData, LOCALITY_CONFLICT_KM, pointOnSurface, type ProjectText } from './lib/sectorpick.ts';
import { localityOverride } from './lib/locality.ts';
import { pointInEdges, type LatLng, type SectorCheck } from './lib/pinmatch.ts';

const areaAliases = loadAreaAliases();
import { canonicalCorridor } from '../shared/corridor.ts';
import type { LocationAccuracy, LocationSource, MapData, MappedProject, Office, Project } from '../shared/types.ts';

const BBOX = { minLat: 28.2, maxLat: 28.56, minLng: 76.85, maxLng: 77.15 };
const CACHE_FILE = 'data/geocode-cache.json';
const OVERRIDES_FILE = 'data/location-overrides.json';
const OUT_FILE = 'public/data/projects.geo.json';
// data/geocode-report.md belongs to scripts/geocode-projects.ts (pins:osm).
const REPORT_FILE = 'data/geocode-summary.md';
const GEOCODED_FILE = 'data/location-geocoded.json';
const MAX_SECTOR_DISTANCE_KM = 2.5;

interface NominatimHit {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  class?: string;
  type: string;
  addresstype?: string;
}
type Override = { lat: number; lng: number; note?: string };

const readJson = <T>(file: string, fallback: T): T =>
  existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : fallback;

const overrides: Record<string, Override> = readJson(OVERRIDES_FILE, {});
if (!existsSync(OVERRIDES_FILE)) writeFileSync(OVERRIDES_FILE, '{}\n');
type GeocodedPin = { lat: number; lng: number; osmType: string; osmId: number; matchedName: string; score: number; accuracy: 'exact' | 'geocoded' };
const geocoded: Record<string, GeocodedPin> = readJson(GEOCODED_FILE, {});

// Shared throttled client (scripts/lib/nominatim.ts); this script keeps its original
// cache file and lower-cased cache keys so existing cache entries still hit.
const client = new NominatimClient(
  CACHE_FILE,
  {
    format: 'jsonv2',
    limit: '5',
    countrycodes: 'in',
    viewbox: `${BBOX.minLng},${BBOX.maxLat},${BBOX.maxLng},${BBOX.minLat}`,
    bounded: '1',
  },
  // This older geocoder keeps its own User-Agent and does not require WCR_CONTACT.
  { userAgent: USER_AGENT, key: (q) => q.toLowerCase().replace(/\s+/g, ' ').trim(), requireContact: false },
);
const nominatim = (q: string) => client.search(q) as Promise<NominatimHit[]>;

const inBox = (lat: number, lng: number) =>
  lat >= BBOX.minLat && lat <= BBOX.maxLat && lng >= BBOX.minLng && lng <= BBOX.maxLng;

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}


type Centre = { lat: number; lng: number; label: string; via: string | null };
const sectorCentres = new Map<string, Centre | null>();
async function findSector(n: string): Promise<Centre | null> {
  const re = new RegExp(`^\\s*sector[\\s-]*${n}\\s*$`, 'i');
  for (const q of [`Sector ${n}, Gurugram, Haryana`, `Sector ${n}, Gurgaon`]) {
    const hits = await nominatim(q);
    const hit = hits.find(
      (h) => re.test(h.name ?? h.display_name.split(',')[0]) && inBox(+h.lat, +h.lon) && (h.category ?? h.class) !== 'highway',
    );
    if (hit) return { lat: +hit.lat, lng: +hit.lon, label: `Sector ${n}`, via: null };
  }
  return null;
}
export async function sectorCentre(sector: string) {
  if (sectorCentres.has(sector)) return sectorCentres.get(sector)!;
  // For "Sector 48 & 49" use the first sector's centre.
  const n = (sector.match(/\d+[A-Z]?/) ?? [''])[0];
  let found = await findSector(n);
  // "Sector 63A" / "67A" are not mapped in OpenStreetMap: use the parent sector (63 / 67).
  if (!found && /[A-Z]$/i.test(n)) {
    const base = await findSector(n.slice(0, -1));
    if (base) found = { ...base, via: `Sector ${n.toUpperCase()} is not mapped in OpenStreetMap; pinned at Sector ${n.slice(0, -1)}` };
  }
  sectorCentres.set(sector, found);
  return found;
}

type Pin = { lat: number; lng: number; accuracy: LocationAccuracy; source: LocationSource; note: string | null };

export interface SectorPin {
  /** Where a sector-level pin goes; null when the sector can't be placed. */
  centre: LatLng | null;
  /** Geometry for "is this point inside the project's sector?" (pins:osm, pins:import). */
  check: SectorCheck | null;
  source: 'nominatim-sector' | 'nominatim-locality';
  note: string;
  log: string;
}

/**
 * The single sector rule used by sector pins, pins:osm and pins:import
 * (see scripts/lib/sectorpick.ts):
 *  1. locality rule: the project's own text puts the sector in Sohna / Gwal Pahari …
 *     and OSM's "Sector N" is > 4 km away → pin at that locality, 4 km radius check
 *  2. chosen OSM sector (Gurugram district, Manesar only if said, Part 1/2):
 *     keep the current Nominatim point if it is inside the chosen polygon,
 *     otherwise a point-on-surface of the chosen polygon
 *  3. no OSM candidate → the old Nominatim centre (incl. 63A → 63 parent) and a 1.5 km radius
 */
export async function sectorPinFor(p: ProjectText): Promise<SectorPin | null> {
  if (!p.sector) return null;
  const data = await loadSectorData();
  const loc = await localityOverride(p, data, areaAliases);
  if (loc)
    return {
      centre: loc.point,
      check: { kind: 'radius', centre: loc.point, radiusKm: LOCALITY_CONFLICT_KM, label: `radius ${LOCALITY_CONFLICT_KM} km around ${loc.locality}` },
      source: 'nominatim-locality',
      note: `Approximate: ${loc.locality} area. The project text says "${loc.text}", and OpenStreetMap's "${p.sector}" is a different place ${loc.distanceKm.toFixed(0)} km away`,
      log: `locality ${loc.locality} (${loc.field}: "${loc.text}")`,
    };
  const old = await sectorCentre(p.sector);
  const pick = chooseSector(data, p);
  const polys = pick?.chosen.filter((c) => c.edges) ?? [];
  if (polys.length) {
    const edges = polys.map((c) => c.edges!);
    const keep = old && edges.some((e) => pointInEdges(old, e));
    const centre = keep ? { lat: old!.lat, lng: old!.lng } : pointOnSurface(polys.sort((a, b) => b.edges!.length - a.edges!.length)[0].edges!);
    const label = polys.map((c) => `${c.osm} "${c.name}"`).join(' + ');
    return {
      centre,
      check: { kind: 'polygon', edges, centre, label: `polygon ${polys.map((c) => c.osm).join('+')}` },
      source: 'nominatim-sector',
      note: pick!.viaParent ? `Approximate: ${p.sector} is not mapped in OpenStreetMap; pinned in Sector ${pick!.key.slice(0, -1)}` : `Approximate: centre of ${p.sector}`,
      log: keep ? `sector ${p.sector}: current point is inside ${label}` : `sector ${p.sector}: point-on-surface of ${label}${old ? ' (old point was outside it)' : ''}`,
    };
  }
  const pt = pick?.chosen[0];
  const centre = pt ? (pt.pointCentre ?? pt.centre) : old ? { lat: old.lat, lng: old.lng } : null;
  if (!centre) return null;
  return {
    centre,
    check: { kind: 'radius', centre, radiusKm: 1.5, label: 'radius 1.5 km' },
    source: 'nominatim-sector',
    note: old?.via ? `Approximate: ${old.via}` : `Approximate: centre of ${p.sector}`,
    log: pt ? `sector ${p.sector}: OSM point ${pt.osm}` : old?.via ? `parent sector (${old.via})` : `sector centre ${p.sector} (Nominatim)`,
  };
}

async function locate(
  p: Pick<Project, 'slug' | 'name' | 'sector' | 'road' | 'address' | 'city' | 'pageCoordinates'> & Partial<Pick<Project, 'pageTitle' | 'description'>>,
  overrideKey: string,
): Promise<{ pin: Pin | null; log: string }> {
  const ov = overrides[overrideKey];
  if (ov && Number.isFinite(ov.lat) && Number.isFinite(ov.lng))
    return { pin: { lat: ov.lat, lng: ov.lng, accuracy: 'exact', source: 'override', note: ov.note ?? null }, log: 'override' };

  if (p.pageCoordinates)
    return {
      pin: { ...p.pageCoordinates, accuracy: 'exact', source: 'page', note: null },
      log: `page (${p.pageCoordinates.source})`,
    };

  // Strict OSM name matches written by `npm run pins:osm -- --apply` (never overrides).
  const g = geocoded[overrideKey];
  if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng))
    return {
      pin: {
        lat: g.lat,
        lng: g.lng,
        accuracy: g.accuracy,
        source: 'osm-name',
        note: `OpenStreetMap ${g.osmType}/${g.osmId} "${g.matchedName}" (score ${g.score})`,
      },
      log: `osm-name ${g.osmType}/${g.osmId} "${g.matchedName}"`,
    };

  // (The old loose name-match step was removed on 2026-11-25: project-level OSM pins
  //  now come only from the strict matcher, `npm run pins:osm`, via location-geocoded.json.)

  const sp = await sectorPinFor({ sector: p.sector, address: p.address, road: p.road, pageTitle: p.pageTitle ?? null, description: p.description ?? null });
  if (sp?.centre)
    return {
      pin: { lat: sp.centre.lat, lng: sp.centre.lng, accuracy: 'sector-approx', source: sp.source, note: sp.note },
      log: sp.log,
    };

  // Area fallback: the road/locality part of the address line, then the same text with
  // website spellings mapped to OSM names (data/area-aliases.json, e.g. "Gwal Pahri").
  const raw = [p.road, p.city].filter(Boolean).join(', ') || p.address;
  const aliased = raw ? applyAliases(raw, areaAliases) : null;
  const areas = [raw, aliased !== raw ? aliased : null].filter(Boolean) as string[];
  for (const area of areas) {
    const hits = await nominatim(`${area}, Haryana`);
    const h = hits.find((x) => inBox(+x.lat, +x.lon));
    if (h)
      return {
        pin: { lat: +h.lat, lng: +h.lon, accuracy: 'sector-approx', source: 'nominatim-area', note: `Approximate: ${area.replace(/,?\s*(Gurgaon|Gurugram).*$/i, '')} area` },
        log: `area "${area}"${area !== raw ? ' (via data/area-aliases.json)' : ''}`,
      };
  }
  return { pin: null, log: 'NOT LOCATED' };
}

async function main() {
  const projects: Project[] = readJson('data/projects.json', []);
  if (!projects.length) throw new Error('data/projects.json is empty: run `npm run scrape` first');
  const officeRaw = readJson<(Office & { pageGeo?: { lat: number; lng: number } | null }) | null>('data/office.json', null);

  const mapped: MappedProject[] = [];
  const logs: string[] = [];
  for (const [i, p] of projects.entries()) {
    const { pin, log } = await locate(p, p.slug);
    process.stdout.write(`[${i + 1}/${projects.length}] ${p.slug}: ${log}\n`);
    logs.push(`| ${p.name} | ${p.sector ?? '–'} | ${pin?.accuracy ?? '**none**'} | ${log.replace(/\|/g, '/')} |`);
    mapped.push({
      ...p,
      lat: pin?.lat ?? null,
      lng: pin?.lng ?? null,
      locationAccuracy: pin?.accuracy ?? null,
      locationSource: pin?.source ?? null,
      locationNote: pin?.note ?? null,
      corridor: canonicalCorridor(p.road, p.address, p.pageTitle),
    });
  }

  // Second pass: a sector OpenStreetMap doesn't know (e.g. "Sector 84") falls back to
  // the mean of this sector's other projects that were located more precisely,
  // instead of the whole-city/area centre.
  const firstSector = (s: string | null) => (s?.match(/\d+[A-Z]?/) ?? [null])[0];
  for (const p of mapped) {
    if (p.locationSource !== 'nominatim-area' && p.lat !== null) continue;
    const n = firstSector(p.sector);
    if (!n) continue;
    const peers = mapped.filter(
      (q) => q !== p && firstSector(q.sector) === n && q.lat !== null && (q.locationAccuracy === 'geocoded' || q.locationAccuracy === 'exact'),
    );
    if (!peers.length) continue;
    p.lat = peers.reduce((s, q) => s + q.lat!, 0) / peers.length;
    p.lng = peers.reduce((s, q) => s + q.lng!, 0) / peers.length;
    p.locationAccuracy = 'sector-approx';
    p.locationSource = 'nominatim-sector';
    p.locationNote = `Approximate: ${p.sector}, placed with ${peers.map((q) => q.name).join(', ')}`;
    const i = logs.findIndex((l) => l.startsWith(`| ${p.name} |`));
    if (i >= 0) logs[i] = `| ${p.name} | ${p.sector} | sector-approx | sector not in OSM → near ${peers.map((q) => q.slug).join(', ')} |`;
  }
  // A project whose sector is known but was only placed by road/city is far off: flag it.
  const cityLevel = mapped.filter((p) => p.locationSource === 'nominatim-area' && p.sector);
  for (const p of cityLevel)
    p.locationNote = `Approximate: ${p.sector} is not mapped in OpenStreetMap, so this pin is only at ${p.road ?? 'city'} level`;

  let office: Office | null = null;
  if (officeRaw) {
    const m = officeRaw.address.match(/\bSector[\s-]*(\d+)/i);
    const sector = m ? `Sector ${m[1]}` : null;
    const { pin, log } = await locate(
      {
        slug: '_office',
        name: officeRaw.address.split(',').slice(0, 3).join(' '),
        sector,
        road: null,
        address: officeRaw.address,
        city: 'Gurugram',
        pageCoordinates: null,
      },
      '_office',
    );
    // Try the business park by name too (the building is in OpenStreetMap).
    let finalPin = pin;
    if (!pin || pin.accuracy === 'sector-approx') {
      // The address names the building complex; OpenStreetMap maps it as "Urbana, Sector 67".
      const park = officeRaw.address.match(/([A-Z0-9][\w ]*?Urbana)/i)?.[1] ?? null;
      const centre = sector ? await sectorCentre(sector) : null;
      for (const q of park ? [`${park}, Gurugram`, `${park.replace(/^M3M\s+/i, '')}, ${sector ?? ''}, Gurugram`] : []) {
        const hits = await nominatim(q);
        const h = hits.find(
          (x) => inBox(+x.lat, +x.lon) && /urbana/i.test(x.display_name) && (!centre || km(centre, { lat: +x.lat, lng: +x.lon }) < MAX_SECTOR_DISTANCE_KM),
        );
        if (h) {
          finalPin = { lat: +h.lat, lng: +h.lon, accuracy: 'geocoded', source: 'nominatim-project', note: `Matched OpenStreetMap: ${h.display_name.split(',').slice(0, 2).join(',')}` };
          break;
        }
      }
    }
    const { pageGeo: _pageGeo, ...rest } = officeRaw;
    office = {
      ...rest,
      lat: finalPin?.lat ?? null,
      lng: finalPin?.lng ?? null,
      locationAccuracy: finalPin?.accuracy ?? null,
      locationSource: finalPin?.source ?? null,
      locationNote: finalPin?.note ?? null,
    };
    logs.push(`| _Office_ | ${sector ?? '–'} | ${finalPin?.accuracy ?? 'none'} | ${log} |`);
  }

  client.save();
  mkdirSync('public/data', { recursive: true });
  const data: MapData = {
    generatedAt: new Date().toISOString(),
    source: 'https://whitecollarrealty.com/gurgaon-projects',
    office,
    projects: mapped,
  };
  writeFileSync(OUT_FILE, JSON.stringify(data));

  // Report
  const by = (a: LocationAccuracy | null) => mapped.filter((p) => p.locationAccuracy === a).length;
  const outside = mapped.filter((p) => p.lat !== null && !inBox(p.lat, p.lng!));
  const unlocated = mapped.filter((p) => p.lat === null);
  const report = [
    '# Geocode report',
    '',
    `- Run at: ${data.generatedAt} (Nominatim network calls this run: ${client.live}, cache hits: ${client.hits})`,
    `- Pins from \`npm run pins:osm\` (data/location-geocoded.json): ${mapped.filter((p) => p.locationSource === 'osm-name').length}`,
    `- Projects: ${mapped.length} — exact ${by('exact')}, geocoded ${by('geocoded')}, sector-approx ${by('sector-approx')}, not located ${unlocated.length}`,
    `- Manual overrides applied: ${mapped.filter((p) => p.locationSource === 'override').length} (edit ${OVERRIDES_FILE})`,
    `- Outside Gurugram bounding box (${BBOX.minLat}–${BBOX.maxLat}, ${BBOX.minLng}–${BBOX.maxLng}): ${outside.length ? outside.map((p) => p.slug).join(', ') : 'none'}`,
    unlocated.length ? `- **Not located (no pin):** ${unlocated.map((p) => p.slug).join(', ')}` : '- Every project has a pin.',
    cityLevel.length
      ? `- **Sector not in OpenStreetMap, pinned only at road/city level — please add an override:** ${cityLevel.map((p) => `${p.slug} (${p.address})`).join(', ')}`
      : '- Every project with a sector is pinned at least at sector level.',
    officeRaw?.pageGeo
      ? `- Note: the contact page's JSON-LD geo (${officeRaw.pageGeo.lat}, ${officeRaw.pageGeo.lng}) is the generic Gurugram city-centre point, ~${km(officeRaw.pageGeo, { lat: office?.lat ?? officeRaw.pageGeo.lat, lng: office?.lng ?? officeRaw.pageGeo.lng }).toFixed(1)} km from the geocoded office, so it is not used.`
      : '',
    '',
    '| Project | Sector | Accuracy | How |',
    '|---|---|---|---|',
    ...logs,
  ];
  writeFileSync(REPORT_FILE, report.filter((l) => l !== undefined).join('\n') + '\n');
  console.log(report.slice(2, 8).join('\n'));
}

// Run only when executed directly (sectorCentre is imported by geocode-projects.ts).
if (process.argv[1] && /geocode\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
