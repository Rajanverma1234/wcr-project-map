// Distances from every project to its nearby places.
//
//   npm run nearby:compute
//
// For each project with a pin:
//   • per category, the nearest 3 places within 10 km (airport and railway: the
//     nearest 1, no radius limit)
//   • straightKm: haversine, 0.1 km
//   • driveKm / driveMin: OSRM public server (router.project-osrm.org), ≤1 request/second.
//     Uses the OSRM "table" service: one request per project location covers all
//     its candidate places. Pairs are cached in data/route-cache.json, so re-runs
//     only fetch new pairs. If OSRM fails, driveKm/driveMin stay null.
//
// Candidates are the 5 nearest by straight line; the final 3 are the nearest by
// road when road distances are known.
//
// A project is recomputed only when it is new, its pin moved more than 50 m, or
// data/pois.json changed. Output: data/nearby.json, public/data/nearby.geo.json,
// data/nearby-report.md.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { USER_AGENT } from './lib/http.ts';
import type { MapData, NearbyItem, Poi, PoiCategory, ProjectNearby } from '../shared/types.ts';

const BBOX = { minLat: 28.2, maxLat: 28.56, minLng: 76.85, maxLng: 77.15 };
const RADIUS_KM = 10;
const PER_CATEGORY = 3;
const CANDIDATES = 5;
const MOVE_THRESHOLD_KM = 0.05; // a pin that moved ≤ 50 m keeps its distances
const NEAREST_ONLY: PoiCategory[] = ['airport', 'railway'];
const CATEGORIES: PoiCategory[] = ['metro', 'railway', 'airport', 'mall', 'hospital', 'school', 'college', 'park', 'bank', 'fuel'];
const OSRM = 'https://router.project-osrm.org';
const ROUTE_CACHE = 'data/route-cache.json';
const NEARBY_FILE = 'data/nearby.json';
const PUBLIC_FILE = 'public/data/nearby.geo.json';
const REPORT_FILE = 'data/nearby-report.md';

const readJson = <T>(f: string, fallback: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : fallback);

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
const r1 = (x: number) => Math.round(x * 10) / 10;
const GENERIC = new Set(['the', 'gurgaon', 'gurugram', 'sector', 'mall', 'hospital', 'school', 'park', 'by', 'and', 'of', 'at', 'phase', 'tower', 'towers', 'residences']);
const nameTokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !GENERIC.has(t));
const key5 = (p: { lat: number; lng: number }) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

type RouteEntry = { km: number; min: number } | { failed: string };
const routeCache: Record<string, RouteEntry> = readJson(ROUTE_CACHE, {});
let osrmCalls = 0;
let osrmFailures = 0;
let last = 0;

/** Road distance from one origin to many destinations (one OSRM table request). */
async function drive(origin: { lat: number; lng: number }, dests: { lat: number; lng: number }[]) {
  const pairKey = (d: { lat: number; lng: number }) => `${key5(origin)}>${key5(d)}`;
  const missing = dests.filter((d) => !(pairKey(d) in routeCache) || 'failed' in routeCache[pairKey(d)]);
  const uniq = [...new Map(missing.map((d) => [key5(d), d])).values()];
  for (let i = 0; i < uniq.length; i += 90) {
    const batch = uniq.slice(i, i + 90);
    const coords = [origin, ...batch].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const url = `${OSRM}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;
    let ok = false;
    for (let attempt = 0; attempt < 4 && !ok; attempt++) {
      const wait = last + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      try {
        const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30_000) });
        const j = (await res.json()) as { code: string; distances?: (number | null)[][]; durations?: (number | null)[][]; message?: string };
        if (!res.ok || j.code !== 'Ok') throw new Error(`${res.status} ${j.code} ${j.message ?? ''}`);
        osrmCalls++;
        batch.forEach((d, k) => {
          const dist = j.distances?.[0][k + 1];
          const dur = j.durations?.[0][k + 1];
          routeCache[pairKey(d)] =
            dist != null && dur != null ? { km: r1(dist / 1000), min: Math.max(1, Math.round(dur / 60)) } : { failed: 'no route' };
        });
        ok = true;
      } catch (err) {
        if (attempt === 3) {
          osrmFailures++;
          batch.forEach((d) => (routeCache[pairKey(d)] = { failed: (err as Error).message }));
        } else await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
    if (osrmCalls % 10 === 0) writeFileSync(ROUTE_CACHE, JSON.stringify(routeCache));
  }
  return (d: { lat: number; lng: number }) => {
    const e = routeCache[pairKey(d)];
    return e && !('failed' in e) ? e : null;
  };
}

async function main() {
  const map: MapData = readJson('public/data/projects.geo.json', null as unknown as MapData);
  if (!map) throw new Error('public/data/projects.geo.json missing: run `npm run geocode` first');
  const pois: Poi[] = readJson('data/pois.json', []);
  if (!pois.length) throw new Error('data/pois.json is empty: run `npm run nearby:fetch` first');
  // Bump ALGO when the selection rules change, so every project is re-selected (routes stay cached).
  const ALGO = 'v3-skip-self-2words';
  const poisHash = createHash('sha1').update(ALGO + JSON.stringify(pois)).digest('hex').slice(0, 12);
  const prev = readJson<{ poisHash?: string; projects?: Record<string, ProjectNearby> }>(NEARBY_FILE, {});
  const byCat = new Map<PoiCategory, Poi[]>(CATEGORIES.map((c) => [c, pois.filter((p) => p.category === c)]));
  const majors = pois.filter((p) => p.category === 'hospital' && p.major);

  const out: Record<string, ProjectNearby> = {};
  let reused = 0;
  let computed = 0;
  const located = map.projects.filter((p) => p.active && p.lat !== null && p.lng !== null);
  for (const [i, p] of located.entries()) {
    const origin = { lat: p.lat!, lng: p.lng! };
    const old = prev.projects?.[p.slug];
    // Reuse unless the pin moved more than 50 m (or the places / selection rules changed).
    if (old && prev.poisHash === poisHash && km(old, origin) <= MOVE_THRESHOLD_KM && 'majorHospital' in old) {
      out[p.slug] = old;
      reused++;
      continue;
    }
    // Candidates by straight line (never the project itself, e.g. a mall project vs. the same mall in OSM)
    const cands: { poi: Poi; straight: number }[] = [];
    const selfTokens = nameTokens(p.name);
    const isSelf = (poi: Poi, d: number) => {
      if (d > 0.5) return false;
      const t = nameTokens(poi.name);
      const shared = t.filter((x) => selfTokens.includes(x)).length;
      // ≥2 distinctive words in common ("AIPL Joy Central" = project "AIPL - Joy Central Gurgaon").
      // One shared word is not enough: "Ambience Mall" is not the project "Ambience Caitriona".
      return shared >= 2;
    };
    for (const cat of CATEGORIES) {
      const ranked = byCat
        .get(cat)!
        .map((poi) => ({ poi, straight: km(origin, poi) }))
        .filter((x) => !isSelf(x.poi, x.straight))
        .filter((x) => NEAREST_ONLY.includes(cat) || x.straight <= RADIUS_KM)
        .sort((a, b) => a.straight - b.straight)
        .slice(0, NEAREST_ONLY.includes(cat) ? 2 : CANDIDATES);
      cands.push(...ranked);
    }
    // Nearest "major" hospitals (any distance): 2 straight-line candidates, best by road.
    const majorCands = majors
      .map((poi) => ({ poi, straight: km(origin, poi) }))
      .sort((a, b) => a.straight - b.straight)
      .slice(0, 2);
    const road = await drive(origin, [...cands, ...majorCands].map((c) => c.poi));
    const toItem = (c: { poi: Poi; straight: number }): NearbyItem => {
      const r = road(c.poi);
      return {
        poiId: c.poi.id,
        name: c.poi.name,
        category: c.poi.category,
        lat: c.poi.lat,
        lng: c.poi.lng,
        straightKm: r1(c.straight),
        driveKm: r?.km ?? null,
        driveMin: r?.min ?? null,
        ...(c.poi.major ? { major: true } : {}),
      };
    };
    const majorHospital =
      majorCands.map(toItem).sort((a, b) => (a.driveKm ?? a.straightKm) - (b.driveKm ?? b.straightKm))[0] ?? null;
    const items: NearbyItem[] = [];
    for (const cat of CATEGORIES) {
      const ranked = cands
        .filter((c) => c.poi.category === cat)
        .map((c) => ({ ...c, road: road(c.poi) }))
        .sort((a, b) => (a.road?.km ?? a.straight) - (b.road?.km ?? b.straight))
        .slice(0, NEAREST_ONLY.includes(cat) ? 1 : PER_CATEGORY);
      for (const c of ranked) items.push(toItem(c));
    }
    out[p.slug] = { slug: p.slug, lat: origin.lat, lng: origin.lng, computedAt: new Date().toISOString(), items, majorHospital };
    computed++;
    if (computed % 10 === 0 || i === located.length - 1) console.log(`[${i + 1}/${located.length}] computed ${computed}, reused ${reused}, OSRM calls ${osrmCalls}`);
  }

  writeFileSync(ROUTE_CACHE, JSON.stringify(routeCache));
  const generatedAt = new Date().toISOString();
  writeFileSync(NEARBY_FILE, JSON.stringify({ generatedAt, poisHash, projects: out }, null, 1) + '\n');
  mkdirSync('public/data', { recursive: true });
  // Frontend payload: compact POI rows + per-project lists.
  writeFileSync(
    PUBLIC_FILE,
    JSON.stringify({
      generatedAt,
      pois: pois.map((p) => [p.id, p.name, p.category, p.lat, p.lng, p.major ? 1 : 0]),
      nearby: Object.fromEntries(
        Object.values(out).map((n) => [
          n.slug,
          {
            i: n.items.map((it) => [it.poiId, it.straightKm, it.driveKm, it.driveMin]),
            m: n.majorHospital ? [n.majorHospital.poiId, n.majorHospital.straightKm, n.majorHospital.driveKm, n.majorHospital.driveMin] : null,
          },
        ]),
      ),
    }),
  );

  // ── Report ──
  const auto = readJson<{ id: string; name: string; category: string; reason: string }[]>('data/poi-auto-excluded.json', []);
  const manualEx = readJson<{ id: string; name: string; category: string; reason: string }[]>('data/poi-exclude.json', []);
  const outside = pois.filter((p) => p.lat < BBOX.minLat || p.lat > BBOX.maxLat || p.lng < BBOX.minLng || p.lng > BBOX.maxLng);
  const without = (cat: PoiCategory) => located.filter((p) => !out[p.slug]?.items.some((it) => it.category === cat));
  const allItems = Object.values(out).flatMap((n) => n.items);
  const noDrive = allItems.filter((it) => it.driveKm === null).length;
  const L: string[] = [
    '# Nearby places report',
    '',
    `- Generated: ${generatedAt}`,
    `- Projects with distances: ${Object.keys(out).length} (computed this run ${computed}, unchanged ${reused})`,
    `- OSRM requests this run: ${osrmCalls}, failed batches: ${osrmFailures}; distances without a road route: ${noDrive} of ${allItems.length}`,
    '- Drive times are OSRM estimates **without traffic**.',
    '',
    '## POIs per category',
    '',
    '| Category | Places | Source |',
    '|---|---|---|',
    ...CATEGORIES.map((c) => {
      const xs = byCat.get(c)!;
      return `| ${c} | ${xs.length} | ${xs.filter((p) => p.source === 'osm').length} OSM, ${xs.filter((p) => p.source === 'manual').length} manual |`;
    }),
    '',
    `Major hospitals (${majors.length}): ${majors.map((m) => m.name).join(', ')}.`,
    ...(() => {
      const missing = readJson<{ name: string; lat: number | null; status?: string }[]>('data/landmarks-manual.json', []).filter(
        (m) => typeof m.lat !== 'number',
      );
      return missing.length ? ['', `**Manual landmarks without verified coordinates (skipped):** ${missing.map((m) => m.name).join(', ')}`] : [];
    })(),
    '',
    `## Projects with no metro within ${RADIUS_KM} km (${without('metro').length})`,
    '',
    ...(without('metro').length ? without('metro').map((p) => `- ${p.name} (${p.sector ?? p.address})`) : ['None.']),
    '',
    `## Projects with no hospital within ${RADIUS_KM} km (${without('hospital').length})`,
    '',
    ...(without('hospital').length ? without('hospital').map((p) => `- ${p.name} (${p.sector ?? p.address})`) : ['None.']),
    '',
    `## POIs outside the Gurugram box (${outside.length})`,
    '',
    ...(outside.length ? outside.map((p) => `- ${p.category}: ${p.name} (${p.lat}, ${p.lng}) — ${p.source}`) : ['None.']),
    '',
    `## Auto-excluded: closed / disused / abandoned in OSM (${auto.length}) — please check`,
    '',
    ...(auto.length
      ? ['| Category | Name | Why | OSM |', '|---|---|---|---|', ...auto.map((a) => `| ${a.category} | ${a.name} | \`${a.reason}\` | https://www.openstreetmap.org/${a.id.replace('osm:', '')} |`)]
      : ['None.']),
    '',
    `## Excluded by data/poi-exclude.json (${manualEx.length})`,
    '',
    ...(manualEx.length ? manualEx.map((x) => `- ${x.category}: ${x.name} — ${x.reason} (${x.id})`) : ['None.']),
    '',
  ];
  writeFileSync(REPORT_FILE, L.join('\n'));
  console.log(L.slice(2, 6).join('\n'));
  console.log(`No metro ≤${RADIUS_KM} km: ${without('metro').length}; no hospital ≤${RADIUS_KM} km: ${without('hospital').length}; POIs outside box: ${outside.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
