// Import hand-placed pins from data/manual-pin-todo.csv into data/location-overrides.json.
//
//   npm run pins:import              dry run (default): show what would be added / rejected
//   npm run pins:import -- --apply   write accepted rows, then `geocode` + `nearby:compute`
//
// Each filled row needs either lat + lng columns, or a "latlng" column with the text
// Google Maps copies on right-click ("28.4123, 77.0456"). Blank rows are skipped.
// Rejected: unreadable values, swapped lat/lng, outside Gurugram/Manesar.
// Needs confirm=yes: a pin outside the project's sector (polygon or 1.5 km radius),
// or a project that already has an override (never overwritten otherwise).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readCsv } from './lib/csv.ts';
import { boundsProblem, isConfirmed, rowCoords, sectorVerdict } from './lib/pinimport.ts';
import { sectorCheckFor } from './lib/sectors.ts';
import { km } from './lib/pinmatch.ts';
import type { Project } from '../shared/types.ts';

const APPLY = process.argv.includes('--apply');
const TODO_FILE = process.argv.find((a) => a.startsWith('--file='))?.slice(7) ?? 'data/manual-pin-todo.csv';
const OVERRIDES_FILE = 'data/location-overrides.json';

type Override = { lat: number; lng: number; note?: string; locationAccuracy?: string };

async function main() {
  const rows = readCsv(TODO_FILE);
  if (!rows.length) throw new Error(`${TODO_FILE} has no rows (run \`npm run pins:osm\` to create it)`);
  if (!('lat' in rows[0] || 'latlng' in rows[0])) throw new Error(`${TODO_FILE} needs "lat"+"lng" columns or a "latlng" column`);
  const projects = new Map((JSON.parse(readFileSync('data/projects.json', 'utf8')) as Project[]).map((p) => [p.slug, p]));
  const overrides: Record<string, Override> = existsSync(OVERRIDES_FILE) ? JSON.parse(readFileSync(OVERRIDES_FILE, 'utf8')) : {};
  const today = new Date().toISOString().slice(0, 10);

  const accepted: { slug: string; name: string; lat: number; lng: number; info: string }[] = [];
  const rejected: { slug: string; reason: string }[] = [];
  let blank = 0;
  for (const row of rows) {
    const slug = (row.slug ?? '').trim();
    const c = rowCoords(row);
    if (c.kind === 'blank') {
      blank++;
      continue;
    }
    const p = projects.get(slug);
    if (!p) {
      rejected.push({ slug: slug || '(no slug)', reason: 'unknown slug (not in data/projects.json)' });
      continue;
    }
    if (c.kind === 'error') {
      rejected.push({ slug, reason: c.reason });
      continue;
    }
    const bad = boundsProblem(c.point);
    if (bad) {
      rejected.push({ slug, reason: bad });
      continue;
    }
    const { check, centre } = await sectorCheckFor(p);
    const verdict = sectorVerdict(c.point, check);
    const confirmed = isConfirmed(row);
    if (verdict === 'outside' && !confirmed) {
      rejected.push({
        slug,
        reason: `outside sector — check (${p.sector}, ${check!.kind}${centre ? `, ${km(centre, c.point).toFixed(2)} km from centre` : ''}); add confirm=yes to import anyway`,
      });
      continue;
    }
    if (overrides[slug] && !confirmed) {
      rejected.push({ slug, reason: `already has an override (${overrides[slug].lat}, ${overrides[slug].lng}); add confirm=yes to replace it` });
      continue;
    }
    accepted.push({
      slug,
      name: p.name,
      ...c.point,
      info: `${c.from}; sector check: ${verdict === 'no-sector' ? 'none (no sector)' : `${verdict} (${check!.kind})`}${verdict === 'outside' ? ', confirmed' : ''}${overrides[slug] ? '; REPLACES existing override (confirmed)' : ''}`,
    });
  }

  console.log(`${APPLY ? 'APPLY' : 'Dry run'}: ${rows.length} rows — ${accepted.length} to add, ${rejected.length} rejected, ${blank} blank (skipped)`);
  for (const a of accepted) console.log(`  + ${a.slug} (${a.name}): ${a.lat}, ${a.lng} — ${a.info}`);
  for (const r of rejected) console.log(`  ✗ ${r.slug}: ${r.reason}`);

  if (!APPLY) {
    if (accepted.length) console.log('Nothing written. Re-run with --apply to add these pins.');
    return;
  }
  if (!accepted.length) {
    console.log('Nothing to apply.');
    return;
  }
  for (const a of accepted)
    overrides[a.slug] = { lat: a.lat, lng: a.lng, locationAccuracy: 'manual', note: `Google Maps, ${today}` };
  writeFileSync(OVERRIDES_FILE, JSON.stringify(overrides, null, 2) + '\n');
  console.log(`Wrote ${accepted.length} pin(s) to ${OVERRIDES_FILE}. Rebuilding pins and nearby distances (moved > 50 m only)…`);
  for (const script of ['geocode', 'nearby:compute']) {
    const r = spawnSync('npm', ['run', script], { stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error(`npm run ${script} failed`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
