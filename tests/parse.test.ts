// Parser tests against real pages saved from whitecollarrealty.com on 2026-11-25
// (tests/fixtures/*.html). Expected values were read off those live pages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAddress, parseDetail, parseInrRange, isDateOnly } from '../scripts/lib/parse.ts';
import { canonicalCorridor } from '../shared/corridor.ts';

const NOW = '2026-11-25T00:00:00.000Z';
const load = (cat: 'residential' | 'commercial', slug: string) =>
  parseDetail(
    readFileSync(new URL(`./fixtures/${cat}__${slug}.html`, import.meta.url), 'utf8'),
    { slug, category: cat, url: `https://whitecollarrealty.com/${cat}_property/${slug}` },
    NOW,
  );

test('Elan The Presidential (residential)', () => {
  const p = load('residential', 'elan-the-presidential');
  assert.equal(p.name, 'Elan The Presidential');
  assert.equal(p.developer, 'Elan');
  assert.equal(p.address, 'Sector 106, Dwarka Expressway, Gurgaon');
  assert.equal(p.sector, 'Sector 106');
  assert.equal(p.road, 'Dwarka Expressway');
  assert.equal(p.priceText, '₹ 6.5 Cr.');
  assert.equal(p.priceInr, 65_000_000);
  assert.equal(p.configurationSummary, '3, 4 & 5 BHK Apt.');
  assert.equal(p.areaText, '2,450 - 7,362 Sq.ft.');
  assert.equal(p.status, 'Under Construction');
  assert.equal(p.possession, '2027');
  assert.deepEqual(p.reraNumbers.map((r) => r.value), ['101 of 2022']);
  assert.equal(p.configurations.length, 9);
  assert.deepEqual(p.configurations[0], {
    type: '3 BHK', sizeText: '2450 Sq. Ft.', sizeSqftMin: 2450, sizeSqftMax: 2450, priceText: '₹4.56 Cr.', priceInr: 45_600_000,
  });
  assert.equal(p.priceMinInr, 45_600_000);
  assert.equal(p.priceMaxInr, 136_000_000);
  assert.equal(p.sizesNotes, 'Payment Plan- 30:30:40');
  assert.equal(p.amenities.length, 21);
  assert.equal(p.highlights.length, 11);
  assert.equal(p.faqs.length, 10);
  assert.equal(p.gallery.length, 11);
  assert.equal(p.floorPlans.length, 4);
  assert.equal(p.landArea?.value, '40 acres');
  assert.equal(p.towers?.value, '18 towers');
  assert.equal(p.units?.value, '1750 apartments');
  assert.match(p.brochureUrl ?? '', /elan-the-presidential\/.*Brochure\.pdf$/);
  assert.equal(p.videoUrl, 'https://www.youtube.com/embed/T-e_mpS2g9o');
  assert.equal(p.pageCoordinates, null);
});

test('Trump Tower: no RERA number on the page stays empty', () => {
  const p = load('residential', 'trump-tower');
  assert.equal(p.priceText, '₹ 14 Cr Onwards*');
  assert.equal(p.priceInr, 140_000_000);
  assert.equal(p.status, 'Ready to Move');
  assert.deepEqual(p.reraNumbers, []);
  assert.equal(p.configurations.length, 3);
  assert.equal(p.road, 'Golf Course Ext. Road');
  assert.equal(canonicalCorridor(p.road, p.address), 'Golf Course Extension Road');
});

test('Elan Miracle (commercial): rate-card table kept as shown, no fake configurations', () => {
  const p = load('commercial', 'elan-miracle');
  assert.equal(p.category, 'commercial');
  assert.equal(p.address, 'Dwarka Expressway, Sector 84, Gurugram');
  assert.equal(p.priceInr, 7_000_000);
  assert.deepEqual(p.configurations, []);
  assert.deepEqual(p.sizesTable?.headers, ['Floor', 'Product', 'BSP', 'Specal Discount', 'NET BSP']);
  assert.deepEqual(p.sizesTable?.rows[0], ['Lower Ground Floor', 'Retails', '15750', '1000', '14750']);
  assert.equal(p.possession, null);
  assert.equal(p.gallery.length, 4);
  assert.equal(p.faqs.length, 0);
});

test('price parsing', () => {
  assert.deepEqual(parseInrRange('₹ 70 Lacs* Onwards'), { min: 7_000_000, max: 7_000_000 });
  assert.deepEqual(parseInrRange('₹ 1.2 - 2.5 Cr'), { min: 12_000_000, max: 25_000_000 });
  assert.equal(parseInrRange('Price On Request'), null);
  assert.equal(parseInrRange('₹ 6.5 Onwards'), null); // no unit on the page: not guessed
});

test('address and status helpers (real address strings from the site)', () => {
  assert.deepEqual(parseAddress('Sector 103, Dwarka Expressway'), { sector: 'Sector 103', road: 'Dwarka Expressway', city: null });
  assert.deepEqual(parseAddress('Sector 2 Gwal Pahari Gurgaon'), { sector: 'Sector 2', road: 'Gwal Pahari', city: 'Gurgaon' });
  assert.deepEqual(parseAddress('Sector 47 & 49, Gurugram'), { sector: 'Sector 47 & 49', road: null, city: 'Gurugram' });
  assert.ok(isDateOnly('Q4 2029'));
  assert.ok(isDateOnly('2023 December'));
  assert.ok(!isDateOnly('Under Construction'));
});
