// Opens the built app in a real browser (installed Edge or Chrome via playwright-core)
// and checks: no console errors, every active project has a pin, the
// ?project=<slug> deep link opens the details panel, and the mobile layout renders.
//
//   npm run build && npm run check:app        (starts `vite preview` itself)
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import type { MapData } from '../shared/types.ts';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS_DIR ?? 'data/screenshots';

async function launch(): Promise<Browser> {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true });
    } catch {
      /* try next */
    }
  }
  throw new Error('No Edge/Chrome found for playwright-core');
}

async function waitForServer(url: string, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server did not start at ${url}`);
}

async function main() {
  const data: MapData = JSON.parse(readFileSync('dist/data/projects.geo.json', 'utf8'));
  const active = data.projects.filter((p) => p.active);
  mkdirSync(SHOTS, { recursive: true });

  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  let failed = false;
  try {
    await waitForServer(BASE);
    const browser = await launch();
    const errors: string[] = [];
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      // Tiles/images can be slow; only our own assets count as failures.
      if (r.url().startsWith(BASE)) errors.push(`requestfailed: ${r.url()}`);
    });

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__wcrStats && window.__wcrStats.pinned > 0, null, { timeout: 15000 });
    const stats = await page.evaluate(() => window.__wcrStats!);
    const listCount = await page.locator('.list .card').count();
    await page.screenshot({ path: `${SHOTS}/desktop.png` });
    console.log(`Active projects: ${active.length}; list items: ${listCount}; pins: ${stats.pinned}; unpinned: ${stats.unpinned.join(', ') || 'none'}`);
    if (stats.pinned !== active.length || listCount !== active.length) failed = true;

    // Filter sync: click the first corridor chip; list and pins should both shrink to the same number.
    await page.locator('.chips').first().locator('.chip').first().click();
    const afterChip = await page.evaluate(() => window.__wcrStats!);
    const afterList = await page.locator('.list .card').count();
    console.log(`After first corridor chip: list ${afterList}, pins ${afterChip.pinned}`);
    if (afterList !== afterChip.pinned) failed = true;

    // Deep link (prefer a precisely pinned project so nearby distances are meaningful)
    const sample = active.find((p) => p.locationSource === 'osm-name' && p.gallery.length > 0) ?? active[0];
    await page.goto(`${BASE}?project=${sample.slug}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.details #d-title', { timeout: 10000 });
    const title = await page.locator('.details #d-title').textContent();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/details.png` });
    console.log(`Deep link ?project=${sample.slug} → details panel "${title}"`);
    if (title?.trim() !== sample.name) failed = true;

    // Nearby: summary row, grouped list, click a row → highlighted place + dashed line; rings drawn.
    await page.waitForSelector('.nearby .nearby-summary li', { timeout: 10000 });
    const summary = await page.locator('.nearby-summary li').allInnerTexts();
    console.log(`Nearby summary: ${summary.map((s) => s.replace(/\s+/g, ' ').trim()).join(' | ')}`);
    if (!summary.some((s) => /Nearest major hospital/i.test(s))) failed = true;
    const rows = await page.locator('.nearby-row').count();
    const rings = await page.locator('path.ring').count();
    await page.locator('.nearby-row').first().click();
    await page.waitForTimeout(1500);
    const dashed = await page.locator('path[stroke-dasharray]').count();
    const activeMarkers = await page.locator('.poi-active').count();
    console.log(`Nearby rows: ${rows}; rings: ${rings}; after row click → dashed lines: ${dashed}, highlighted markers: ${activeMarkers}`);
    if (!rows || rings !== 2 || !dashed || activeMarkers !== 1) failed = true;
    await page.screenshot({ path: `${SHOTS}/nearby.png` });

    // Extra deep links (CHECK_SLUGS=a,b): title + the location note matching the pin accuracy.
    for (const slug of (process.env.CHECK_SLUGS ?? '').split(',').filter(Boolean)) {
      const p = active.find((x) => x.slug === slug);
      if (!p) {
        console.log(`Deep link ${slug}: unknown slug`);
        failed = true;
        continue;
      }
      await page.goto(`${BASE}?project=${slug}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.details #d-title', { timeout: 10000 });
      await page.waitForTimeout(1200);
      const t = (await page.locator('.details #d-title').textContent())?.trim();
      const light = await page.locator('.details .approx-note.is-light').count();
      const rough = await page.locator('.details .approx-note:not(.is-light)').count();
      const expected = p.locationSource === 'override' || p.locationAccuracy === 'exact' ? 'none' : p.locationAccuracy === 'geocoded' ? 'map-data note' : 'rough-guide note';
      const got = light ? 'map-data note' : rough ? 'rough-guide note' : 'none';
      const nearbyRows = await page.locator('.nearby-row').count();
      console.log(`Deep link ${slug}: "${t}" — accuracy ${p.locationAccuracy}/${p.locationSource}, note: ${got} (expected ${expected}), nearby rows ${nearbyRows}`);
      if (t !== p.name || got !== expected || !nearbyRows) failed = true;
      await page.screenshot({ path: `${SHOTS}/deeplink-${slug}.png` });
    }

    // Keyboard: Escape closes the panel and clears the URL param
    await page.keyboard.press('Escape');
    const closed = (await page.locator('.details').count()) === 0 && !page.url().includes('project=');
    console.log(`Escape closes panel: ${closed}`);
    if (!closed) failed = true;

    // City-wide POI layer: off by default; enabling "Metro" renders only visible-area markers.
    // Start from the whole-city view (a previous deep link may have left the map zoomed in).
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__wcrStats && window.__wcrStats.pinned > 0);
    const before = await page.locator('.poi-city').count();
    await page.locator('.nearby-toggles summary').click();
    await page.locator('.nearby-toggles label', { hasText: 'Metro' }).click();
    await page.waitForTimeout(800);
    const metroPins = await page.locator('.poi-city').count();
    const metroClusters = await page.locator('.poi-cluster').count();
    console.log(`City POI layer: off by default (${before} markers); Metro on → ${metroPins} markers + ${metroClusters} clusters`);
    if (before !== 0 || metroPins + metroClusters === 0) failed = true;
    await page.screenshot({ path: `${SHOTS}/city-metro.png` });

    // Dark mode + mobile
    const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
    const m = await mctx.newPage();
    m.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
    m.on('console', (msg) => msg.type() === 'error' && errors.push(`mobile console: ${msg.text()}`));
    await m.goto(BASE, { waitUntil: 'networkidle' });
    await m.waitForFunction(() => window.__wcrStats && window.__wcrStats.pinned > 0);
    const mapTop = await m.locator('.map-area').boundingBox();
    const sideTop = await m.locator('.sidebar').boundingBox();
    console.log(`Mobile: map at y=${mapTop?.y}, list at y=${sideTop?.y} (map on top: ${(mapTop?.y ?? 1) < (sideTop?.y ?? 0)})`);
    await m.screenshot({ path: `${SHOTS}/mobile-dark.png` });
    const scrollW = await m.evaluate(() => document.documentElement.scrollWidth);
    console.log(`Mobile horizontal overflow: ${scrollW > 390 ? 'YES (' + scrollW + 'px)' : 'none'}`);
    if (scrollW > 390) failed = true;

    // Mobile Nearby section: collapsed by default, expands on tap, no overflow.
    await m.goto(`${BASE}?project=${sample.slug}`, { waitUntil: 'networkidle' });
    await m.waitForSelector('.details .nearby', { timeout: 10000 });
    const openBefore = await m.locator('.details .nearby').evaluate((d) => (d as HTMLDetailsElement).open);
    await m.locator('.details .nearby > summary').scrollIntoViewIfNeeded();
    await m.locator('.details .nearby > summary').click();
    const openAfter = await m.locator('.details .nearby').evaluate((d) => (d as HTMLDetailsElement).open);
    await m.locator('.details .nearby-summary').scrollIntoViewIfNeeded();
    await m.screenshot({ path: `${SHOTS}/mobile-nearby.png` });
    const panelOverflow = await m.locator('.details .d-scroll').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    console.log(`Mobile Nearby: collapsed by default ${!openBefore}, opens on tap ${openAfter}, horizontal overflow ${panelOverflow}`);
    if (openBefore || !openAfter || panelOverflow) failed = true;

    console.log(errors.length ? `Console errors:\n  ${errors.join('\n  ')}` : 'Console errors: none');
    if (errors.length) failed = true;
    await browser.close();
  } finally {
    server.kill();
  }
  console.log(failed ? 'CHECK FAILED' : 'CHECK PASSED');
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
