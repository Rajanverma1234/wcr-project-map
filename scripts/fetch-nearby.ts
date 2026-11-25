// Fetch nearby-place data (POIs) for the Gurugram area from OpenStreetMap (Overpass API).
//
//   npm run nearby:fetch                       all categories
//   npm run nearby:fetch -- --only=metro,mall   just these categories (others kept from data/pois.json)
//   npm run nearby:fetch -- --refresh           ignore data/osm-cache/ and re-download
//
// Politeness: one request at a time, a pause between requests, identifying
// User-Agent, exponential backoff on 429/502/504, rotating public mirrors.
// Raw responses are cached in data/osm-cache/<query>.json.
//
// Output: data/pois.json  [{ id, name, category, lat, lng, source: "osm" | "manual" }]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { overpass as overpassQuery, type OsmElement, type Tags } from './lib/overpass.ts';
import type { Poi, PoiCategory } from '../shared/types.ts';

export const BBOX = { south: 28.2, west: 76.85, north: 28.56, east: 77.15 };
const B = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const POIS_FILE = 'data/pois.json';
const MANUAL_FILE = 'data/landmarks-manual.json';
const EXCLUDE_FILE = 'data/poi-exclude.json';
const AUTO_EXCLUDED_FILE = 'data/poi-auto-excluded.json';
const REVIEW_FILE = 'data/poi-review.md';
const DEDUPE_M = 150;

const overpass = (key: string, refresh: boolean) => overpassQuery(key, QUERIES[key], { refresh });

// One Overpass query per data set. Metro and railway share the station query
// (one request instead of two) and are split by tags below.
const QUERIES: Record<string, string> = {
  stations: `nwr["railway"~"^(station|halt)$"](${B});nwr["public_transport"="station"](${B});`,
  mall: `nwr["shop"="mall"]["name"](${B});`,
  hospital: `nwr["amenity"="hospital"]["name"](${B});nwr["healthcare"="hospital"]["name"](${B});`,
  school: `nwr["amenity"="school"]["name"](${B});`,
  college: `nwr["amenity"~"^(college|university)$"]["name"](${B});`,
  park: `nwr["leisure"="park"]["name"](${B});`,
  bank: `nwr["amenity"="bank"]["name"](${B});`,
  fuel: `nwr["amenity"="fuel"]["name"](${B});`,
};

const METRO_WORDS = /metro|rapid|dmrc|subway/i;
const isMetro = (t: Tags) =>
  /^(subway|light_rail|monorail)$/.test(t.station ?? '') ||
  t.subway === 'yes' ||
  t.light_rail === 'yes' ||
  t.monorail === 'yes' ||
  METRO_WORDS.test(`${t.network ?? ''} ${t.operator ?? ''} ${t.line ?? ''} ${t.name ?? ''} ${t['name:en'] ?? ''}`);
const isRail = (t: Tags) =>
  !isMetro(t) &&
  (t.train === 'yes' || t.station === 'train' || /indian\s*railways?|northern\s*railway/i.test(`${t.network ?? ''} ${t.operator ?? ''}`) || t.railway === 'station' || t.railway === 'halt');

/** Which category each raw query feeds, with a tag filter. */
const CATEGORY_SOURCES: Record<Exclude<PoiCategory, 'airport'>, { query: string; keep: (t: Tags) => boolean }> = {
  metro: { query: 'stations', keep: isMetro },
  railway: { query: 'stations', keep: isRail },
  mall: { query: 'mall', keep: () => true },
  // Clinics etc. tagged as hospitals are not dropped silently: they are flagged
  // for review (REVIEW_PATTERNS) and excluded by id in data/poi-exclude.json.
  hospital: { query: 'hospital', keep: () => true },
  school: { query: 'school', keep: () => true },
  college: { query: 'college', keep: () => true },
  park: { query: 'park', keep: () => true },
  bank: { query: 'bank', keep: () => true },
  fuel: { query: 'fuel', keep: () => true },
};
export const ALL_CATEGORIES: PoiCategory[] = ['metro', 'railway', 'airport', 'mall', 'hospital', 'school', 'college', 'park', 'bank', 'fuel'];

/** Lifecycle / closure signals in OSM tags → excluded automatically (listed in the report). */
export function lifecycleReason(t: Tags): string | null {
  for (const [k, v] of Object.entries(t)) {
    // Only lifecycle prefixes on the feature key itself (e.g. disused:amenity=hospital,
    // construction:railway=station). Attribute sub-keys such as
    // construction:expected_completion_date (a station being renovated) do not count.
    if (/^(disused|abandoned|was|removed|demolished|razed|destroyed|construction|proposed):(amenity|shop|railway|leisure|healthcare|public_transport|station|aeroway|building|landuse)$/.test(k))
      return `${k}=${v}`;
    if (/^(disused|abandoned|closed|demolished)$/.test(k) && v !== 'no') return `${k}=${v}`;
  }
  if (/^(closed|off)$/i.test(t.opening_hours ?? '')) return `opening_hours=${t.opening_hours}`;
  if (t.end_date && /^\d{4}/.test(t.end_date) && t.end_date.slice(0, 10) <= new Date().toISOString().slice(0, 10))
    return `end_date=${t.end_date}`;
  for (const k of ['note', 'description', 'fixme', 'FIXME', 'check_date:opening_hours', 'comment']) {
    if (t[k] && /\b(permanently\s+)?closed\b|shut\s*down|no\s+longer\s+(exists|operat)|demolished/i.test(t[k])) return `${k}="${t[k]}"`;
  }
  if (/\((closed|permanently closed|shut)\)|\bclosed\b$/i.test(t.name ?? '')) return `name="${t.name}"`;
  return null;
}

/** Names that suggest the place is not really in this category → listed for a human decision. */
export const REVIEW_PATTERNS: Partial<Record<PoiCategory, RegExp>> = {
  hospital:
    /^dr\.?\s|^doctor\s|clinic|nursing\s*home|maternity|dental|dentist|eye\s*(care|centre|center|hospital)|dispensar|diagnostic|path(olog)?\s*lab|pharmac|chemist|medical\s*(centre|center|store)|health\s*(centre|center|care)|polyclinic|physio|ayurved|homoeo|homeo|hearing|ivf|fertility|skin|derma|vet(erinary)?|animal|pet|\bphc\b|\bchc\b|\besi\b|wellness|rehab|de-?addiction|care\s*centre/i,
  school:
    /play\s*-?school|pre-?school|playway|play\s*way|kinder|nursery|kid|toddler|montessori|day\s*care|creche|cr[eè]che|coaching|tuition|tutorial|classes|academy|institute|learning\s*(centre|center)|ielts|computer|driving|dance|music|yoga|abacus|hobby|skill|training|foundation|nios|tiny|little|tots|baby|cambridge\s*(montessori|kids)|early\s*years/i,
  college: /coaching|tuition|classes|institute\s+of\s+(beauty|makeup)|training\s+(centre|center)/i,
};


const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Tidy display names: "Moulsari Avenue Station" → "Moulsari Avenue", "Sector 53/54 Metro Station" → "Sector 53/54". */
function displayName(name: string, category: PoiCategory) {
  if (category === 'metro') return name.replace(/\s+(rmrg\s+)?(metro\s+)?station$/i, '').trim() || name;
  return name;
}

interface AutoExcluded {
  id: string;
  name: string;
  category: PoiCategory;
  reason: string;
}
const autoExcluded: AutoExcluded[] = [];
const tagsById = new Map<string, Tags>();

function toPois(elements: OsmElement[], category: PoiCategory, keep: (t: Tags) => boolean): Poi[] {
  const out: Poi[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const rawName = (t['name:en'] || t.name || '').trim();
    if (!rawName || !keep(t)) continue;
    const id = `osm:${e.type}/${e.id}`;
    const closed = lifecycleReason(t);
    if (closed) {
      autoExcluded.push({ id, name: rawName, category, reason: closed });
      continue;
    }
    const lat = e.lat ?? e.center?.lat; // areas (ways/relations) use their centre
    const lng = e.lon ?? e.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    tagsById.set(id, t);
    out.push({ id, name: displayName(rawName, category), category, lat: +lat.toFixed(6), lng: +lng.toFixed(6), source: 'osm' });
  }
  return out;
}

/** Name key for de-duplication: ignores generic words ("Sector 53/54 Metro Station" = "Sector 53-54"). */
const dedupeKey = (s: string) =>
  normName(s)
    .replace(/\b(metro|rapid|rmrg|station|stn|railway|junction|jn|halt|the|mall)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Same name within 150 m → one place (prefer the station/area object over stop nodes). */
function dedupe(pois: Poi[]): Poi[] {
  const kept: Poi[] = [];
  const rank = (p: Poi) => (p.id.startsWith('osm:node') ? 1 : 0);
  for (const p of [...pois].sort((a, b) => rank(a) - rank(b))) {
    const n = dedupeKey(p.name);
    if (kept.some((k) => k.category === p.category && dedupeKey(k.name) === n && metres(k, p) <= DEDUPE_M)) continue;
    kept.push(p);
  }
  return kept;
}

interface ManualLandmark {
  slug: string;
  name: string;
  category: PoiCategory;
  lat: number | null;
  lng: number | null;
  aliases?: string[];
  major?: boolean;
  status?: string;
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const only = args.only ? (args.only as string).split(',').map((s) => s.trim() as PoiCategory) : ALL_CATEGORIES;
  const bad = only.filter((c) => !ALL_CATEGORIES.includes(c));
  if (bad.length) throw new Error(`Unknown categories: ${bad.join(', ')}. Use: ${ALL_CATEGORIES.join(', ')}`);
  const refresh = args.refresh === undefined ? false : true;

  const manual: ManualLandmark[] = existsSync(MANUAL_FILE) ? JSON.parse(readFileSync(MANUAL_FILE, 'utf8')) : [];
  const excludes: { id: string; name: string; category: PoiCategory; reason: string }[] = existsSync(EXCLUDE_FILE)
    ? JSON.parse(readFileSync(EXCLUDE_FILE, 'utf8'))
    : [];
  const excludeIds = new Set(excludes.map((x) => x.id));
  const previous: Poi[] = existsSync(POIS_FILE) ? JSON.parse(readFileSync(POIS_FILE, 'utf8')) : [];
  const prevAuto: AutoExcluded[] = existsSync(AUTO_EXCLUDED_FILE) ? JSON.parse(readFileSync(AUTO_EXCLUDED_FILE, 'utf8')) : [];
  const fresh: Poi[] = [];
  const review: { poi: Poi; tags: Tags; match: string }[] = [];

  console.log(`Categories: ${only.join(', ')}`);
  const rawByQuery = new Map<string, OsmElement[]>();
  for (const cat of only) {
    if (cat === 'airport') continue; // airport comes from landmarks-manual.json only
    const src = CATEGORY_SOURCES[cat];
    if (!rawByQuery.has(src.query)) rawByQuery.set(src.query, await overpass(src.query, refresh));
    const all = dedupe(toPois(rawByQuery.get(src.query)!, cat, src.keep));
    const pois = all.filter((p) => !excludeIds.has(p.id));
    if (all.length !== pois.length) console.log(`  ${cat}: ${all.length - pois.length} excluded by ${EXCLUDE_FILE}`);
    const re = REVIEW_PATTERNS[cat];
    if (re)
      for (const p of pois) {
        const m = p.name.match(re);
        if (m) review.push({ poi: p, tags: tagsById.get(p.id) ?? {}, match: m[0] });
      }
    // Manual landmarks win over OSM places with the same name (or alias).
    const manualNames = new Set(
      manual.filter((m) => m.category === cat).flatMap((m) => [m.name, ...(m.aliases ?? [])].map(normName)),
    );
    const replaced = pois.filter((p) => manualNames.has(normName(p.name)));
    fresh.push(...pois.filter((p) => !manualNames.has(normName(p.name))));
    if (replaced.length) console.log(`  ${cat}: ${replaced.length} OSM place(s) replaced by manual landmarks (${replaced.map((p) => p.name).join(', ')})`);
  }
  for (const m of manual.filter((m) => only.includes(m.category))) {
    if (typeof m.lat !== 'number' || typeof m.lng !== 'number') {
      console.warn(`  ! manual landmark "${m.name}" has no verified coordinates (${m.status ?? 'missing lat/lng'}) — skipped`);
      continue;
    }
    fresh.push({
      id: `manual:${m.slug}`,
      name: m.name,
      category: m.category,
      lat: m.lat,
      lng: m.lng,
      source: 'manual',
      ...(m.major ? { major: true } : {}),
    });
  }

  const merged = [...previous.filter((p) => !only.includes(p.category)), ...fresh].sort(
    (a, b) => ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category) || a.name.localeCompare(b.name),
  );
  writeFileSync(POIS_FILE, JSON.stringify(merged, null, 1) + '\n');
  const counts = ALL_CATEGORIES.map((c) => `${c} ${merged.filter((p) => p.category === c).length}`).join(', ');
  console.log(`Wrote ${POIS_FILE}: ${merged.length} places (${counts})`);

  // Lifecycle exclusions (kept per category across partial runs) → read by the nearby report.
  const autoAll = [...prevAuto.filter((a) => !only.includes(a.category)), ...autoExcluded];
  writeFileSync(AUTO_EXCLUDED_FILE, JSON.stringify(autoAll, null, 1) + '\n');
  if (autoExcluded.length) console.log(`Auto-excluded (closed/disused): ${autoExcluded.length}`);

  // Names that look like a different kind of place: for a human to accept or exclude.
  const lines = [
    '# POIs to review',
    '',
    `Generated ${new Date().toISOString()} for: ${only.join(', ')}.`,
    `These are **still included**. To drop one, copy its id into \`${EXCLUDE_FILE}\` with a reason and re-run \`npm run nearby:fetch\`.`,
    '',
  ];
  for (const cat of only) {
    const rows = review.filter((r) => r.poi.category === cat);
    if (!REVIEW_PATTERNS[cat]) continue;
    lines.push(`## ${cat} — ${rows.length} flagged of ${merged.filter((p) => p.category === cat).length}`, '');
    if (!rows.length) {
      lines.push('Nothing flagged.', '');
      continue;
    }
    lines.push('| Name | Matched | OSM tags | id |', '|---|---|---|---|');
    for (const r of rows.sort((a, b) => a.poi.name.localeCompare(b.poi.name))) {
      const t = Object.entries(r.tags)
        .filter(([k]) => /^(amenity|healthcare|healthcare:speciality|school|isced:level|operator|beds|emergency|grades|operator:type)$/.test(k))
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      const link = `https://www.openstreetmap.org/${r.poi.id.replace('osm:', '')}`;
      lines.push(`| ${r.poi.name.replace(/\|/g, '/')} | ${r.match} | ${t} | [${r.poi.id}](${link}) |`);
    }
    lines.push('');
  }
  writeFileSync(REVIEW_FILE, lines.join('\n'));
  console.log(`Review list: ${REVIEW_FILE} (${review.length} flagged)`);
}

// Run only when executed directly (helpers are imported by compute-nearby.ts).
if (process.argv[1] && /fetch-nearby\.ts$/.test(process.argv[1].replace(/\\/g, '/'))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
