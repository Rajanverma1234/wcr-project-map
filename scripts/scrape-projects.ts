// Scrape White Collar Realty projects from whitecollarrealty.com.
//
//   npm run scrape                          full run (Gurgaon listing, 151 projects as of 2026-11-25)
//   npm run scrape -- --only=elan-the-presidential,elan-miracle
//   npm run scrape -- --limit=5
//   npm run scrape -- --scope=all           every project on /all-projects (incl. Dubai, Noida…)
//   npm run scrape -- --cache               re-parse saved HTML in data/raw/ without fetching
//
// Output: data/projects.json, data/office.json, data/scrape-report.md, data/raw/*.html
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PoliteClient } from './lib/http.ts';
import { SITE, parseDetail, parseListing, parseListingCount, parseOffice } from './lib/parse.ts';
import type { Category, Project } from '../shared/types.ts';

const DATA = 'data';
const RAW = join(DATA, 'raw');
const PROJECTS_FILE = join(DATA, 'projects.json');
const OFFICE_FILE = join(DATA, 'office.json');
const REPORT_FILE = join(DATA, 'scrape-report.md');

const LISTINGS = { gurgaon: 'gurgaon-projects', all: 'all-projects' } as const;

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const scope = (args.scope ?? 'gurgaon') as keyof typeof LISTINGS;
if (!(scope in LISTINGS)) throw new Error(`--scope must be one of ${Object.keys(LISTINGS).join(', ')}`);
const only = args.only ? new Set(args.only.split(',').map((s: string) => s.trim().toLowerCase())) : null;
const limit = args.limit ? Number(args.limit) : null;
const useCache = args.cache === 'true';
const partial = Boolean(only || limit);

mkdirSync(RAW, { recursive: true });
const client = new PoliteClient(1500, 3);

async function getPage(path: string, cacheName: string): Promise<string> {
  const file = join(RAW, `${cacheName}.html`);
  if (useCache && existsSync(file)) return readFileSync(file, 'utf8');
  const html = await client.get(new URL(path, SITE).toString());
  writeFileSync(file, html);
  return html;
}

// Fields whose absence goes in the report (null / empty = "Details on request" in the UI).
const TRACKED: (keyof Project)[] = [
  'developer', 'address', 'sector', 'road', 'propertyType', 'configurationSummary', 'areaText',
  'configurations', 'priceText', 'priceInr', 'status', 'possession', 'reraNumbers', 'landArea',
  'towers', 'units', 'description', 'highlights', 'amenities', 'mainImage', 'gallery', 'floorPlans',
  'brochureUrl', 'pageCoordinates',
];
const isMissing = (v: unknown) => v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === '';

async function main() {
  const now = new Date().toISOString();
  console.log(`Scope: ${scope} (${LISTINGS[scope]})${only ? ` only=${[...only].join(',')}` : ''}${limit ? ` limit=${limit}` : ''}${useCache ? ' [cache]' : ''}`);

  // 1. Listing → project URLs
  const listingHtml = await getPage(LISTINGS[scope], `_listing_${scope}`);
  const listed = parseListing(listingHtml);
  const statedCount = parseListingCount(listingHtml);
  console.log(`Listing links: ${listed.length} (page says: ${statedCount ?? 'n/a'})`);

  let targets = listed;
  if (only) {
    targets = listed.filter((t) => only.has(t.slug));
    const missing = [...only].filter((s) => !targets.some((t) => t.slug === s));
    if (missing.length) console.warn(`Not on the ${scope} listing: ${missing.join(', ')}`);
  }
  if (limit) targets = targets.slice(0, limit);

  // 2. Existing data for merge
  const existing: Project[] = existsSync(PROJECTS_FILE) ? JSON.parse(readFileSync(PROJECTS_FILE, 'utf8')) : [];
  const byUrl = new Map(existing.map((p) => [p.sourceUrl, p]));

  // 3. Detail pages, strictly one at a time
  const failures: { url: string; error: string }[] = [];
  const scraped: Project[] = [];
  for (const [i, t] of targets.entries()) {
    process.stdout.write(`[${i + 1}/${targets.length}] ${t.category}/${t.slug} … `);
    try {
      const html = await getPage(`${t.category}_property/${t.slug}`, `${t.category}__${t.slug}`);
      const p = parseDetail(html, { slug: t.slug, url: t.url, category: t.category as Category }, now);
      const prev = byUrl.get(p.sourceUrl);
      if (prev) p.firstSeenAt = prev.firstSeenAt;
      scraped.push(p);
      console.log(`ok (${p.priceText ?? 'no price'}, ${p.configurations.length} config rows)`);
    } catch (err) {
      const msg = (err as Error).message;
      failures.push({ url: t.url, error: msg });
      console.log(`FAILED: ${msg}`);
    }
  }

  // 4. Merge: update + add; on a full run, mark projects no longer listed as inactive.
  const merged = new Map(existing.map((p) => [p.sourceUrl, p]));
  for (const p of scraped) merged.set(p.sourceUrl, p);
  let deactivated: Project[] = [];
  if (!partial) {
    const listedUrls = new Set(listed.map((t) => t.url));
    const failedUrls = new Set(failures.filter((f) => /HTTP 40[4]|HTTP 410/.test(f.error)).map((f) => f.url));
    deactivated = [...merged.values()].filter((p) => p.active && (!listedUrls.has(p.sourceUrl) || failedUrls.has(p.sourceUrl)));
    for (const p of deactivated) merged.set(p.sourceUrl, { ...p, active: false });
  }
  const all = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(PROJECTS_FILE, JSON.stringify(all, null, 2) + '\n');

  // 5. Office (contact page)
  try {
    const contactHtml = await getPage('contact_us', '_contact_us');
    const office = parseOffice(contactHtml, `${SITE}contact_us`);
    writeFileSync(OFFICE_FILE, JSON.stringify(office, null, 2) + '\n');
    console.log(`Office: ${office.address}`);
  } catch (err) {
    failures.push({ url: `${SITE}contact_us`, error: (err as Error).message });
  }

  // 6. Report
  const lines: string[] = [];
  lines.push(`# Scrape report`, '', `- Run at: ${now}`, `- Scope: \`${scope}\` → ${SITE}${LISTINGS[scope]}`);
  lines.push(`- Listing page states: **${statedCount ?? 'n/a'}** properties; links found: **${listed.length}**`);
  lines.push(`- Run type: ${partial ? `partial (${only ? 'only=' + [...only].join(',') : ''}${limit ? ' limit=' + limit : ''}) — inactive marking skipped` : 'full'}`);
  lines.push(`- Scraped this run: **${scraped.length}**, failed: **${failures.length}**`);
  lines.push(`- projects.json total: **${all.length}** (active ${all.filter((p) => p.active).length}, inactive ${all.filter((p) => !p.active).length})`);
  if (deactivated.length) lines.push(`- Newly marked inactive: ${deactivated.map((p) => p.slug).join(', ')}`);
  lines.push('');
  if (failures.length) {
    lines.push('## Failed pages', '', ...failures.map((f) => `- ${f.url} — ${f.error}`), '');
  }
  lines.push('## Missing fields per project (this run)', '');
  lines.push('Missing = not shown on the project page; the UI shows "Details on request".', '');
  const counts = new Map<string, number>();
  for (const p of scraped) {
    const miss = TRACKED.filter((k) => isMissing(p[k]));
    miss.forEach((k) => counts.set(k, (counts.get(k) ?? 0) + 1));
    lines.push(`- **${p.name}** (${p.slug}): ${miss.length ? miss.join(', ') : 'none'}`);
  }
  lines.push('', '## Field coverage', '', '| Field | Missing in |', '|---|---|');
  for (const k of TRACKED) lines.push(`| ${k} | ${counts.get(k) ?? 0} / ${scraped.length} |`);
  writeFileSync(REPORT_FILE, lines.join('\n') + '\n');
  console.log(`Wrote ${PROJECTS_FILE} (${all.length}), ${REPORT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
