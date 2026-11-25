// Read-only: which sector / area strings from data/projects.json could not be found in
// OpenStreetMap as written (needed an alias, a parent sector, or failed).
//   npm run areas:report → data/area-lookup-report.md
import { readFileSync, writeFileSync } from 'node:fs';
import { chooseSector, loadAreaAliases, loadSectorData, applyAliases, localityFor } from './lib/sectorpick.ts';
import type { Project } from '../shared/types.ts';

async function main() {
  const projects = (JSON.parse(readFileSync('data/projects.json', 'utf8')) as Project[]).filter((p) => p.active);
  const geo = JSON.parse(readFileSync('public/data/projects.geo.json', 'utf8')) as { projects: { slug: string; locationSource: string; locationNote: string | null }[] };
  const src = new Map(geo.projects.map((p) => [p.slug, p]));
  const data = await loadSectorData();
  const aliases = loadAreaAliases();
  const rows: string[] = [];
  for (const p of projects) {
    const pin = src.get(p.slug);
    const issues: string[] = [];
    if (p.sector) {
      const pick = chooseSector(data, p);
      if (!pick || !pick.all.length) issues.push(`"${p.sector}" not in OpenStreetMap`);
      else if (pick.viaParent) issues.push(`"${p.sector}" not in OpenStreetMap; parent Sector ${pick.key.slice(0, -1)} used`);
      else if (!pick.chosen.length) issues.push(`"${p.sector}": only namesakes outside Gurugram`);
      const loc = localityFor(p, aliases);
      if (pin?.locationSource === 'nominatim-locality') issues.push(`sector is in ${loc?.locality} numbering → pinned at ${loc?.locality} (text: "${loc?.text}")`);
    }
    const area = [p.road, p.city].filter(Boolean).join(', ') || p.address || '';
    if (area && applyAliases(area, aliases) !== area) issues.push(`area "${area}" needed alias → "${applyAliases(area, aliases)}"`);
    if (pin?.locationSource === 'nominatim-area' && p.sector) issues.push('pinned at road/area level only');
    if (!pin) issues.push('NOT LOCATED');
    if (issues.length) rows.push(`| ${p.name} | ${p.sector ?? '–'} | ${p.address ?? '–'} | ${issues.join('; ')} | ${pin?.locationSource ?? '–'} |`);
  }
  const out = [
    '# Sector / area strings that needed help',
    '',
    `Generated ${new Date().toISOString()}. Aliases live in data/area-aliases.json (not in code).`,
    '',
    '| Project | Sector | Address (as on website) | Issue | Pin source now |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ];
  writeFileSync('data/area-lookup-report.md', out.join('\n'));
  console.log(`${rows.length} projects listed → data/area-lookup-report.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
