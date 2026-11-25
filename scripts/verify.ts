// STEP 5 checks against the live website:
//  1. project count in projects.json vs. the count the listing page states
//  2. spot-check N random projects field by field: every stored value must
//     appear in the live page (text fields) or its HTML (URLs)
//
//   npm run verify            (5 random projects)
//   npm run verify -- --n=10 --slugs=trump-tower,elan-miracle
// Output: data/verify-report.md
import { readFileSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { PoliteClient } from './lib/http.ts';
import { SITE, parseListing, parseListingCount } from './lib/parse.ts';
import type { Project } from '../shared/types.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const N = Number(args.n ?? 5);
const client = new PoliteClient(1500, 3);
const norm = (s: string) =>
  s
    .replace(/ /g, ' ')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

async function main() {
  const projects: Project[] = JSON.parse(readFileSync('data/projects.json', 'utf8'));
  const active = projects.filter((p) => p.active);
  const out: string[] = ['# Verification report', '', `Run at: ${new Date().toISOString()}`, ''];

  // 1. Counts
  const listingHtml = await client.get(`${SITE}gurgaon-projects`);
  const stated = parseListingCount(listingHtml);
  const links = parseListing(listingHtml);
  const liveUrls = new Set(links.map((l) => l.url));
  const ours = new Set(active.map((p) => p.sourceUrl));
  const missing = [...liveUrls].filter((u) => !ours.has(u));
  const extra = [...ours].filter((u) => !liveUrls.has(u));
  out.push('## Project count', '');
  out.push(`- Website says: **${stated ?? 'n/a'}** ("Showing N properties" on /gurgaon-projects)`);
  out.push(`- Project links on that page: **${links.length}**`);
  out.push(`- Active projects in data/projects.json: **${active.length}**`);
  out.push(`- On website but not in data: ${missing.length ? missing.join(', ') : 'none'}`);
  out.push(`- In data but no longer on website: ${extra.length ? extra.join(', ') : 'none'}`);
  out.push(`- Result: ${stated === active.length && !missing.length && !extra.length ? '✅ match' : '❌ mismatch — re-run `npm run scrape`'}`, '');

  // 2. Spot checks
  const pick = args.slugs
    ? active.filter((p) => args.slugs.split(',').includes(p.slug))
    : [...active].sort(() => Math.random() - 0.5).slice(0, N);
  let fails = 0;
  for (const p of pick) {
    const html = await client.get(p.sourceUrl);
    const $ = cheerio.load(html);
    $('script, style, noscript').remove();
    const text = norm($('body').text());
    const raw = html;
    const rows: [string, string, boolean | null][] = [];
    const checkText = (label: string, v: string | null | undefined) => {
      if (v === null || v === undefined || v === '') rows.push([label, '— (not on page → "Details on request")', null]);
      else rows.push([label, v, text.includes(norm(v))]);
    };
    const checkUrl = (label: string, v: string | null | undefined) => {
      if (!v) return rows.push([label, '—', null]);
      const rel = v.replace(SITE, '');
      rows.push([label, rel.length > 70 ? '…' + rel.slice(-67) : rel, raw.includes(rel)]);
    };
    checkText('Name', p.name);
    checkText('Address', p.address);
    checkText('Developer', p.developer);
    checkText('Price', p.priceText);
    if (p.priceInr) rows.push(['Price (numeric)', `${p.priceInr.toLocaleString('en-IN')} INR`, raw.includes(`"price":"${p.priceInr}"`) || text.includes(norm(p.priceText ?? '#'))]);
    checkText('Type', p.propertyType);
    checkText('Configurations', p.configurationSummary);
    checkText('Area', p.areaText);
    checkText('Status', p.status);
    checkText('Possession', p.possession);
    for (const r of p.reraNumbers) checkText('RERA', r.value);
    if (!p.reraNumbers.length) checkText('RERA', null);
    for (const f of [p.landArea, p.towers, p.units]) if (f) checkText(`Fact: ${f.value}`, f.evidence.replace(/…$/, ''));
    const c0 = p.configurations[0];
    if (c0) {
      checkText(`Size row 1 type`, c0.type);
      checkText(`Size row 1 size`, c0.sizeText);
      checkText(`Size row 1 price`, c0.priceText);
    }
    rows.push([
      'Sizes table rows',
      String(p.sizesTable?.rows.length ?? 0),
      (() => {
        const live = cheerio.load(html)('#floorplan table tr').length;
        const ours = (p.sizesTable?.rows.length ?? 0) + (p.sizesTable?.headers.length ? 1 : 0);
        return live === ours;
      })(),
    ]);
    if (p.amenities.length) {
      checkText(`Amenity (first of ${p.amenities.length})`, p.amenities[0]);
      checkText(`Amenity (last of ${p.amenities.length})`, p.amenities[p.amenities.length - 1]);
    }
    if (p.highlights.length) checkText(`Highlight (first of ${p.highlights.length})`, p.highlights[0]);
    checkText('Description (first 80 chars)', p.description?.slice(0, 80));
    checkUrl('Main image', p.mainImage);
    checkUrl(`Gallery (last of ${p.gallery.length})`, p.gallery[p.gallery.length - 1]);
    checkUrl('Brochure', p.brochureUrl);

    const bad = rows.filter((r) => r[2] === false).length;
    fails += bad;
    out.push(`## ${p.name}`, '', `Live page: ${p.sourceUrl}`, '', '| Field | Stored value | On live page |', '|---|---|---|');
    for (const [l, v, ok] of rows) out.push(`| ${l} | ${v.replace(/\|/g, '/').replace(/\n/g, ' ')} | ${ok === null ? 'n/a' : ok ? '✅' : '❌'} |`);
    out.push('', `Mismatches: ${bad}`, '');
    console.log(`${p.slug}: ${rows.length} checks, ${bad} mismatches`);
  }
  out.splice(3, 0, `**Summary:** count ${stated === active.length ? 'matches' : 'MISMATCH'} (${active.length}/${stated}); ${pick.length} projects spot-checked, ${fails} field mismatches.`, '');
  writeFileSync('data/verify-report.md', out.join('\n') + '\n');
  console.log(`Count: data ${active.length} vs website ${stated}. Field mismatches: ${fails}. → data/verify-report.md`);
  if (fails || stated !== active.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
