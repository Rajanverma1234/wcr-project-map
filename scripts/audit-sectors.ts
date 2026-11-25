// Read-only audit of sector-name collisions ("Sector 15" exists in Gurugram AND Manesar).
//
//   npm run sectors:audit      → data/sector-audit.md (changes nothing)
//
// For every sector used by a project: every OSM object named "Sector N" (polygons from
// the cached Overpass sector query + points from the geocoder's Nominatim cache), its
// centroid, distance from Rajiv Chowk, whether it lies inside the Manesar town / IMT
// boundary, its tehsil, which one the current pins use, and which one the proposed
// rule would choose.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { overpass, type OsmElement } from './lib/overpass.ts';
import { NominatimClient } from './lib/nominatim.ts';
import { km, pointInEdges, sectorKey, type Edges, type LatLng } from './lib/pinmatch.ts';
import { sectorCentre } from './geocode.ts';
import { canonicalCorridor } from '../shared/corridor.ts';
import type { Project } from '../shared/types.ts';

const B = '28.15,76.8,28.6,77.2';
const readJson = <T>(f: string, d: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : d);

function edgesOf(e: OsmElement): Edges {
  const edges: Edges = [];
  const add = (g?: { lat: number; lon: number }[]) => {
    if (g) for (let i = 1; i < g.length; i++) edges.push([{ lat: g[i - 1].lat, lng: g[i - 1].lon }, { lat: g[i].lat, lng: g[i].lon }]);
  };
  if (e.type === 'way') add(e.geometry);
  else for (const m of e.members ?? []) if (m.type === 'way' && m.role !== 'subarea') add(m.geometry);
  return edges;
}
const centroid = (edges: Edges): LatLng => ({
  lat: edges.reduce((s, [a]) => s + a.lat, 0) / edges.length,
  lng: edges.reduce((s, [a]) => s + a.lng, 0) / edges.length,
});

interface Cand {
  key: string;
  part: string | null; // "1" / "2" for "Sector 15-I" / "Sector 15 Part 2"
  osm: string;
  name: string;
  kind: string;
  centre: LatLng;
  pointCentre: LatLng | null; // Nominatim's centre for the same object (what current pins use)
  edges: Edges | null;
  inManesar: boolean;
  tehsil: string; // "–" = outside Gurugram district (e.g. Dwarka, Delhi)
}
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3' };
const partOf = (name: string) => {
  const m = name.match(/sector[\s-]*\d+[a-z]?[\s-]*(?:part[\s-]*)?(i{1,3}|\d)\s*\)?$/i) ?? name.match(/part[\s-]*(i{1,3}|\d)/i);
  return m ? (ROMAN[m[1].toLowerCase()] ?? m[1]) : null;
};
const areaClass = (c: Cand) => (c.tehsil === '–' ? 'outside Gurugram district' : c.inManesar ? 'Manesar/IMT' : 'Gurugram');

async function main() {
  // Admin areas: Manesar town (admin_level 8), IMT Manesar, and the 5 tehsils (for reference).
  const admin = await overpass(
    'admin-geometry',
    `rel(id:3631133,10398244,10398245,10398246,10398247,10398248);nwr["name"~"^IMT Manesar",i]["landuse"](${B});nwr["name"~"^IMT Manesar",i]["place"](${B});`,
    { out: 'out geom;', timeout: 180 },
  );
  const manesarAreas = admin.filter((e) => e.id === 3631133 || /imt manesar/i.test(e.tags?.name ?? '')).map(edgesOf);
  const tehsils = admin.filter((e) => e.tags?.admin_level === '6').map((e) => ({ name: e.tags!.name, edges: edgesOf(e) }));
  const inManesar = (p: LatLng) => manesarAreas.some((ed) => ed.length && pointInEdges(p, ed));
  const tehsilOf = (p: LatLng) => tehsils.find((t) => pointInEdges(p, t.edges))?.name ?? '–';

  // Rajiv Chowk reference point (looked up, not typed in)
  const nom = new NominatimClient('data/geocode-cache/nominatim.json', { format: 'jsonv2', countrycodes: 'in', limit: '3' });
  const rc = (await nom.search('Rajiv Chowk, Gurugram, Haryana')).find((h) => /rajiv chowk/i.test(h.display_name));
  nom.save();
  if (!rc) throw new Error('Rajiv Chowk not found on Nominatim');
  const RAJIV = { lat: +rc.lat, lng: +rc.lon };

  // Candidates: polygons (Overpass) + points (geocoder's Nominatim cache)
  const polys = await overpass(
    'sector-polygons',
    `rel["name"~"^[Ss]ector[ -]?[0-9]"]["boundary"](${B});rel["name"~"^[Ss]ector[ -]?[0-9]"]["place"](${B});way["name"~"^[Ss]ector[ -]?[0-9]"]["place"](${B});way["name"~"^[Ss]ector[ -]?[0-9]"]["boundary"](${B});`,
    { out: 'out geom;', timeout: 180 },
  );
  const cands = new Map<string, Cand>();
  for (const e of polys) {
    const key = sectorKey(e.tags?.name ?? '');
    if (!key) continue;
    const edges = edgesOf(e);
    if (edges.length < 3) continue;
    const c = centroid(edges);
    cands.set(`${e.type}/${e.id}`, { key, part: partOf(e.tags!.name), osm: `${e.type}/${e.id}`, name: e.tags!.name, kind: `polygon (${e.tags?.boundary ? 'boundary=' + e.tags.boundary : 'place=' + e.tags?.place})`, centre: c, pointCentre: null, edges, inManesar: inManesar(c), tehsil: tehsilOf(c) });
  }
  const geoCache = readJson<Record<string, { osm_type?: string; osm_id?: number; lat: string; lon: string; name?: string; display_name: string; category?: string; type: string }[]>>('data/geocode-cache.json', {});
  for (const [q, hits] of Object.entries(geoCache)) {
    if (!/^sector /.test(q)) continue;
    for (const h of hits) {
      const nm = h.name ?? h.display_name.split(',')[0];
      const key = sectorKey(nm);
      if (!key || !h.osm_type) continue;
      const id = `${h.osm_type}/${h.osm_id}`;
      const c = { lat: +h.lat, lng: +h.lon };
      if (cands.has(id)) {
        cands.get(id)!.pointCentre = c;
        continue;
      }
      if (h.category === 'highway') continue; // bus stops / streets named "Sector N" are not sectors
      cands.set(id, { key, part: partOf(nm), osm: id, name: nm, kind: `point (${h.category}=${h.type})`, centre: c, pointCentre: c, edges: null, inManesar: inManesar(c), tehsil: tehsilOf(c) });
    }
  }

  // Sectors used by projects
  const projects = readJson<Project[]>('data/projects.json', []).filter((p) => p.active);
  const geo = readJson<{ projects: { slug: string; lat: number; lng: number; locationSource: string }[] }>('public/data/projects.geo.json', { projects: [] });
  const pinOf = new Map(geo.projects.map((p) => [p.slug, p]));
  const sectors = new Map<string, Project[]>();
  for (const p of projects) {
    for (const n of p.sector?.match(/\d+[A-Z]?/g) ?? []) (sectors.get(n) ?? sectors.set(n, []).get(n)!).push(p);
  }
  const keys = [...sectors.keys()].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));

  const L: string[] = [
    '# Sector name audit (read-only)',
    '',
    `Generated ${new Date().toISOString()}. Reference: Rajiv Chowk ${RAJIV.lat.toFixed(5)}, ${RAJIV.lng.toFixed(5)} (Nominatim: ${rc.display_name.split(',').slice(0, 3).join(',')}).`,
    'Manesar = inside OSM relation 3631133 "Manesar" (admin_level 8) or an "IMT Manesar" area. Tehsil shown for reference only (many Gurugram sectors are in Sohna/Manesar tehsil).',
    '',
    '**Proposed rule:** for a Gurugram project use only candidates outside Manesar; use Manesar/IMT candidates only if the project text says Manesar. Prefer polygons; several Gurugram parts (e.g. Part 1 + Part 2) are merged into one sector shape.',
    '',
    '| Sector | Projects | Candidate | Kind | Centroid | From Rajiv Chowk | Area | Tehsil | Used now | Proposed | Flags |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const summary: { key: string; flags: string[] }[] = [];
  for (const key of keys) {
    const ps = sectors.get(key)!;
    const mentionsManesar = ps.some((p) => /manesar/i.test(`${p.address} ${p.road} ${p.pageTitle}`));
    let cs = [...cands.values()].filter((c) => c.key === key);
    let viaParent = false;
    if (!cs.length && /[A-Z]$/.test(key)) {
      cs = [...cands.values()].filter((c) => c.key === key.slice(0, -1));
      viaParent = cs.length > 0;
    }
    const current = await sectorCentre(`Sector ${key}`);
    const usedNow = (c: Cand) => !!current && (km(current, c.centre) < 0.15 || (!!c.pointCentre && km(current, c.pointCentre) < 0.15));
    // Proposed: inside Gurugram district; Manesar/IMT only when the project says Manesar.
    let eligible = cs.filter((c) => c.tehsil !== '–' && (mentionsManesar ? c.inManesar : !c.inManesar));
    // "Sector 15 (Part-2)" → only Part 2 if the project text names a part and OSM has it.
    const wantPart = [...new Set(ps.map((p) => partOf(p.address ?? '')).filter(Boolean))];
    if (wantPart.length === 1 && eligible.some((c) => c.part === wantPart[0])) eligible = eligible.filter((c) => c.part === wantPart[0]);
    const polysOk = eligible.filter((c) => c.edges);
    const proposed = new Set((polysOk.length ? polysOk : eligible.slice(0, 1)).map((c) => c.osm));
    // Area consistency: an address naming a locality (e.g. "Sector 2 Gwal Pahari") must be near it.
    const flags: string[] = [];
    for (const p of ps) {
      const locality = canonicalCorridor(p.road, p.address);
      if (!locality || !/gwal pahari|sohna$|manesar|badshahpur|nirvana|sushant lok|dlf phase/i.test(locality)) continue;
      const hit = (await nom.search(`${locality.replace(/ \/.*$/, '')}, Gurugram, Haryana`)).find((h) => +h.lat > 28.1 && +h.lat < 28.65);
      const chosen = [...proposed].map((id) => cands.get(id)!).filter(Boolean);
      if (hit && chosen.length) {
        const d = Math.min(...chosen.map((c) => km({ lat: +hit.lat, lng: +hit.lon }, c.centre)));
        if (d > 4) flags.push(`**${p.name}: address says ${locality}, but OSM "Sector ${key}" is ${d.toFixed(1)} km from it** (different numbering scheme; do not use)`);
      }
    }
    if (cs.length > 1) flags.push(`${cs.length} candidates`);
    if (cs.some((c) => usedNow(c) && c.inManesar) && !mentionsManesar) flags.push('**current pin in Manesar, project is not**');
    if (cs.some((c) => usedNow(c) && c.tehsil === '–')) flags.push('**current pin outside Gurugram district**');
    if (cs.some((c) => usedNow(c)) && !cs.some((c) => usedNow(c) && proposed.has(c.osm))) flags.push('**proposed differs from current**');
    if (!cs.length) flags.push('no OSM sector object');
    if (viaParent) flags.push(`no "Sector ${key}" in OSM; parent sector used`);
    if (cs.length && !eligible.length) flags.push('**no eligible candidate** (radius fallback)');
    if (current && !cs.some(usedNow)) flags.push('current centre is not one of these objects');
    if (wantPart.length) flags.push(`project names Part ${wantPart.join('/')}`);
    summary.push({ key, flags });
    const projText = `${ps.length}: ${ps.slice(0, 3).map((p) => p.name).join(', ')}${ps.length > 3 ? '…' : ''}`;
    if (!cs.length) {
      L.push(`| ${key} | ${projText} | – | – | – | – | – | – | ${current ? `${current.lat.toFixed(4)}, ${current.lng.toFixed(4)}` : '–'} | radius | ${flags.join('; ')} |`);
      continue;
    }
    cs.sort((a, b) => km(RAJIV, a.centre) - km(RAJIV, b.centre)).forEach((c, i) => {
      L.push(
        `| ${i ? '' : key} | ${i ? '' : projText} | [${c.osm}](https://www.openstreetmap.org/${c.osm}) "${c.name}" | ${c.kind} | ${c.centre.lat.toFixed(4)}, ${c.centre.lng.toFixed(4)} | ${km(RAJIV, c.centre).toFixed(1)} km | ${areaClass(c) === 'Gurugram' ? 'Gurugram' : `**${areaClass(c)}**`} | ${c.tehsil} | ${usedNow(c) ? '✔' : ''} | ${proposed.has(c.osm) ? '✔' : ''} | ${i ? '' : flags.join('; ')} |`,
      );
    });
  }
  const pick = (re: RegExp) => summary.filter((s) => s.flags.some((f) => re.test(f))).map((s) => s.key);
  L.splice(
    5,
    0,
    `**Summary:** ${keys.length} sectors used by projects. More than one candidate: ${pick(/candidates/).join(', ') || 'none'}. ` +
      `Current pin in Manesar but project is not: ${pick(/current pin in Manesar/).join(', ') || 'none'}. ` +
      `Current pin outside Gurugram district: ${pick(/outside Gurugram district\*\*/).join(', ') || 'none'}. ` +
      `Proposed differs from current: ${pick(/proposed differs/).join(', ') || 'none'}. ` +
      `Address locality conflicts with OSM sector: ${pick(/address says/).join(', ') || 'none'}.`,
    '',
  );
  // ── Which sector-centre pins would move under the proposed rule ──
  L.push('', '## Sector-centre pins that would move', '', '| Project | Sector | Address | Current pin | Proposed pin | Moves | Basis |', '|---|---|---|---|---|---|---|');
  for (const p of projects) {
    const cur = pinOf.get(p.slug);
    if (!cur || !['nominatim-sector', 'nominatim-area'].includes(cur.locationSource) || !p.sector) continue;
    const key = p.sector.match(/\d+[A-Z]?/)![0];
    const flagged = summary.find((s) => s.key === key)?.flags.find((f) => f.includes(`${p.name}: address says`));
    let target: LatLng | null = null;
    let basis = '';
    if (flagged) {
      const locality = canonicalCorridor(p.road, p.address)!;
      const hit = (await nom.search(`${locality}, Gurugram, Haryana`)).find((h) => +h.lat > 28.1 && +h.lat < 28.65);
      if (hit) {
        target = { lat: +hit.lat, lng: +hit.lon };
        basis = `${locality} area (OSM sector ${key} is elsewhere)`;
      }
    } else {
      let cs = [...cands.values()].filter((c) => c.key === key);
      if (!cs.length && /[A-Z]$/.test(key)) cs = [...cands.values()].filter((c) => c.key === key.slice(0, -1));
      const mentionsManesar = /manesar/i.test(`${p.address} ${p.road} ${p.pageTitle}`);
      let el = cs.filter((c) => c.tehsil !== '–' && (mentionsManesar ? c.inManesar : !c.inManesar));
      const part = partOf(p.address ?? '');
      if (part && el.some((c) => c.part === part)) el = el.filter((c) => c.part === part);
      const pol = el.filter((c) => c.edges);
      const use = pol.length ? pol : el.slice(0, 1);
      if (use.length) {
        const pts = use.map((c) => c.pointCentre ?? c.centre);
        target = { lat: pts.reduce((s, x) => s + x.lat, 0) / pts.length, lng: pts.reduce((s, x) => s + x.lng, 0) / pts.length };
        basis = use.map((c) => `${c.osm} "${c.name}"`).join(' + ');
      }
    }
    if (!target) continue;
    const moved = km(cur, target);
    if (moved <= 0.05) continue;
    L.push(`| ${p.name} | ${p.sector} | ${p.address} | ${cur.lat.toFixed(4)}, ${cur.lng.toFixed(4)} | ${target.lat.toFixed(4)}, ${target.lng.toFixed(4)} | **${moved < 1 ? Math.round(moved * 1000) + ' m' : moved.toFixed(1) + ' km'}** | ${basis} |`);
  }
  nom.save();
  writeFileSync('data/sector-audit.md', L.join('\n') + '\n');
  console.log(L[5]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
