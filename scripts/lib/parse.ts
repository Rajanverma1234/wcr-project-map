// Parsers for whitecollarrealty.com pages. Selectors were written against the
// live DOM (server-rendered HTML, <base href="https://whitecollarrealty.com/">).
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type {
  Category,
  Configuration,
  Faq,
  FeatureItem,
  FloorPlan,
  Office,
  Project,
  TextFact,
} from '../../shared/types.ts';

export const SITE = 'https://whitecollarrealty.com/';

const clean = (s: string | undefined | null): string =>
  (s ?? '').replace(/\u00a0/g, ' ').replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const oneLine = (s: string | undefined | null) => clean(s).replace(/\n+/g, ' ').trim();
const orNull = (s: string | undefined | null) => {
  const v = oneLine(s);
  return v ? v : null;
};
const abs = (href: string | undefined | null): string | null => {
  if (!href || href === '#' || href.startsWith('javascript:')) return null;
  try {
    return new URL(href, SITE).toString();
  } catch {
    return null;
  }
};
const uniq = <T>(xs: T[]) => [...new Set(xs)];

// ───────────────────────── listing pages ─────────────────────────

/** All project detail paths linked from a listing page, in page order. */
export function parseListing(html: string): { category: Category; slug: string; url: string }[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: { category: Category; slug: string; url: string }[] = [];
  $('a[href]').each((_, a) => {
    const url = abs($(a).attr('href'));
    if (!url) return;
    const m = new URL(url).pathname.match(/^\/(residential|commercial)_property\/([a-z0-9-]+)\/?$/i);
    if (!m) return;
    const key = `${m[1]}/${m[2]}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      category: m[1].toLowerCase() as Category,
      slug: m[2].toLowerCase(),
      url: `${SITE}${m[1].toLowerCase()}_property/${m[2].toLowerCase()}`,
    });
  });
  return out;
}

/** Count the page states, e.g. "Showing 151 properties". */
export function parseListingCount(html: string): number | null {
  const $ = cheerio.load(html);
  const m = $('body').text().match(/Showing\s+(\d+)\s+propert/i);
  return m ? Number(m[1]) : null;
}

// ───────────────────────── money / size helpers ─────────────────────────

/** Parse Indian price text ("₹ 6.5 Cr.", "₹85 Lac*", "1.2 - 2.5 Cr") into INR. */
export function parseInrRange(text: string | null): { min: number; max: number } | null {
  if (!text) return null;
  const t = text.replace(/,/g, '').replace(/\u20b9|rs\.?|inr/gi, ' ');
  const re = /(\d+(?:\.\d+)?)\s*(?:(cr(?:ore)?s?|lacs?|lakhs?|lkh|l|k|thousand)\b\.?)?/gi;
  const nums: { n: number; unit: string | null }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) nums.push({ n: Number(m[1]), unit: m[2]?.toLowerCase() ?? null });
  if (!nums.length) return null;
  // A range like "1.2 - 2.5 Cr" shares the trailing unit.
  const lastUnit = [...nums].reverse().find((x) => x.unit)?.unit ?? null;
  const mult = (u: string | null) => {
    if (!u) return null;
    if (u.startsWith('cr')) return 1e7;
    if (u.startsWith('la') || u.startsWith('lk') || u === 'l') return 1e5;
    if (u === 'k' || u === 'thousand') return 1e3;
    return null;
  };
  const values = nums
    .map((x) => {
      const k = mult(x.unit ?? lastUnit);
      if (k) return x.n * k;
      return x.n >= 100000 ? x.n : null; // plain rupees only if clearly a full amount
    })
    .filter((v): v is number => v !== null)
    .map((v) => Math.round(v));
  if (!values.length) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Sizes in sq ft only; other units keep the text and get null numbers. */
export function parseSqft(text: string | null): { min: number; max: number } | null {
  if (!text || !/sq\.?\s*f/i.test(text)) return null;
  const nums = (text.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((n) => n >= 50);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

// ───────────────────────── free-text facts ─────────────────────────

function sentences(texts: string[]): string[] {
  return texts
    .flatMap((t) => clean(t).split(/\n+|(?<=[.!?])\s+(?=[A-Z])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

function findFact(texts: string[], re: RegExp, pick: (m: RegExpMatchArray) => string): TextFact | null {
  for (const s of sentences(texts)) {
    const m = s.match(re);
    if (m) return { value: pick(m), evidence: s.length > 300 ? s.slice(0, 297) + '…' : s };
  }
  return null;
}

const RERA_PATTERNS: RegExp[] = [
  // RC/REP/HARERA/GGM/123/456/2022/12 and similar HARERA formats
  /\b((?:RC\/REP\/)?HARERA\/GGM\/[A-Z0-9/-]*\d)/gi,
  /\b(GGM\/\d+\/\d+\/\d{4}\/\d+)/gi,
  // "RERA No. 101 of 2022", "HRERA Registration No: 35 of 2023"
  /\bH?A?RERA[^.\n]{0,40}?(?:No\.?|Number|Reg(?:istration|d)?\.?(?:\s*No\.?)?)\s*[:\-–]?\s*(\d{1,4}\s+of\s+\d{4})/gi,
  /\b(\d{1,4}\s+of\s+\d{4})\s+is\s+the\s+(?:H?RERA\s+)?registration/gi,
];

export function findReraNumbers(texts: string[]): TextFact[] {
  const out = new Map<string, TextFact>();
  for (const s of sentences(texts)) {
    if (!/rera|harera|GGM\//i.test(s)) continue;
    for (const re of RERA_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const value = m[1].replace(/\s+/g, ' ').trim();
        const key = value.toUpperCase();
        if (!out.has(key)) out.set(key, { value, evidence: s.length > 300 ? s.slice(0, 297) + '…' : s });
      }
    }
  }
  return [...out.values()];
}

// ───────────────────────── detail page ─────────────────────────

function jsonLd($: CheerioAPI): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).text());
      for (const it of [].concat(j['@graph'] ?? j)) items.push(it);
    } catch {
      /* ignore malformed blocks */
    }
  });
  return items;
}

function listItems($: CheerioAPI, scope: ReturnType<CheerioAPI>): string[] {
  return scope
    .find('li')
    .map((_, li) => oneLine($(li).text()))
    .get()
    .filter(Boolean);
}

/** Tab pane (Highlights / Amenities) located by its tab label text. */
function tabPaneItems($: CheerioAPI, label: RegExp): string[] {
  let items: string[] = [];
  $('#highlights .nav-tabs a.nav-link').each((_, a) => {
    if (items.length || !label.test($(a).text())) return;
    const id = $(a).attr('aria-controls') || ($(a).attr('href') ?? '').replace(/^#/, '');
    if (id) items = listItems($, $(`#highlights #${id}`));
  });
  return items;
}

function findPageCoordinates($: CheerioAPI, html: string): Project['pageCoordinates'] {
  const inGurugramish = (lat: number, lng: number) => lat > 20 && lat < 35 && lng > 70 && lng < 85;
  // Google Maps embeds: ...!3d28.41!2d77.04... or ?q=28.41,77.04 or @28.41,77.04
  for (const src of $('iframe[src*="google"]').map((_, el) => $(el).attr('src') ?? '').get()) {
    const m =
      src.match(/!3d(-?\d+\.\d+)!2d(-?\d+\.\d+)/) ??
      src.match(/[?&](?:q|ll|center)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
      src.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m && inGurugramish(+m[1], +m[2])) return { lat: +m[1], lng: +m[2], source: 'google-maps-iframe' };
  }
  const lat = $('[data-lat]').first().attr('data-lat');
  const lng = $('[data-lng], [data-lon], [data-long]').first().attr('data-lng');
  if (lat && lng && inGurugramish(+lat, +lng)) return { lat: +lat, lng: +lng, source: 'data-attributes' };
  for (const it of jsonLd($)) {
    const geo = (it as { geo?: { latitude?: unknown; longitude?: unknown } }).geo;
    if (geo?.latitude && geo?.longitude && inGurugramish(+geo.latitude, +geo.longitude))
      return { lat: +geo.latitude, lng: +geo.longitude, source: 'json-ld' };
  }
  const m = html.match(/L\.marker\(\s*\[\s*(\d+\.\d+)\s*,\s*(\d+\.\d+)\s*\]/);
  if (m && inGurugramish(+m[1], +m[2])) return { lat: +m[1], lng: +m[2], source: 'leaflet-marker' };
  return null;
}

function parseSizesTable($: CheerioAPI): {
  table: Project['sizesTable'];
  configurations: Configuration[];
} {
  const table = $('#floorplan table').first();
  if (!table.length) return { table: null, configurations: [] };
  const rows = table
    .find('tr')
    .toArray()
    .map((tr) =>
      $(tr)
        .children('th,td')
        .map((_, c) => oneLine($(c).text()))
        .get(),
    )
    .filter((r) => r.some(Boolean));
  if (!rows.length) return { table: null, configurations: [] };
  const first = rows[0].map((h) => h.toLowerCase());
  const looksLikeHeader = first.some((h) =>
    /^(type|size|sizes|area|price|unit|config|configuration|product|floor|typology|bsp)/.test(h),
  );
  const headers = looksLikeHeader ? rows[0] : [];
  const body = looksLikeHeader ? rows.slice(1) : rows;
  const raw = { headers, rows: body };

  // Header-less tables on this site are "Type | Size | Price".
  const header = looksLikeHeader ? first : ['type', 'size', 'price'].slice(0, rows[0].length);
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const iType = Math.max(0, col(/type|unit|config|product|typology/));
  const iSize = col(/size|area|sq/);
  const iPrice = col(/price|cost/);
  // Rate cards (BSP per sq ft etc.) have neither column: keep only the raw table.
  if (iSize < 0 && iPrice < 0) return { table: raw, configurations: [] };
  const configurations = body
    .filter((r) => r.some(Boolean))
    .map((r) => {
      const sizeText = iSize >= 0 ? r[iSize] || null : null;
      const priceText = iPrice >= 0 ? r[iPrice] || null : null;
      const sq = parseSqft(sizeText);
      const pr = parseInrRange(priceText);
      return {
        type: r[iType] ?? '',
        sizeText,
        sizeSqftMin: sq?.min ?? null,
        sizeSqftMax: sq?.max ?? null,
        priceText,
        priceInr: pr?.min ?? null,
      };
    })
    .filter((c) => c.type);
  return { table: raw, configurations };
}

const CITY_RE = /\b(gurgaon|gurugram|haryana|india|delhi\s*ncr|ncr)\b/gi;

/** Split "Sector 106, Dwarka Expressway, Gurgaon" (commas optional) into parts. */
export function parseAddress(address: string | null) {
  if (!address) return { sector: null, road: null, city: null };
  // "Sector 106", "Sector 63A", "Sector 32-33", "Sector 48 & 49"
  // A trailing "(Part-2)" belongs to the sector, not the road.
  const SECTOR_RE = /\bsector[\s-]*(\d+[A-Z]?)(?:\s*(-|&|and|\/)\s*(\d+[A-Z]?))?\b(?:\s*\([^)]*\))?/i;
  const sm = address.match(SECTOR_RE);
  const sector = sm
    ? `Sector ${sm[1].toUpperCase()}${sm[3] ? `${sm[2] === '-' || sm[2] === '/' ? sm[2] : ` ${sm[2]} `}${sm[3].toUpperCase()}` : ''}`
    : null;
  const cityM = address.match(/\b(gurgaon|gurugram)\b/i);
  const city = cityM ? cityM[1][0].toUpperCase() + cityM[1].slice(1).toLowerCase() : null;
  const rest = address
    .replace(SECTOR_RE, ' ')
    .replace(CITY_RE, ' ')
    .replace(/\b\d{6}\b/g, ' ')
    .split(',')
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const road = rest.length ? rest.join(', ') : null;
  return { sector, road, city };
}

/** Status fields that only hold a date ("2032", "Q4 2029", "2023 December") are possession dates. */
export const isDateOnly = (s: string | null) =>
  !!s && /^(?:q[1-4]\s*)?(?:[a-z]+\s+)?\d{4}(?:\s+[a-z]+)?$/i.test(s.trim());

export function parseDetail(
  html: string,
  meta: { slug: string; url: string; category: Category },
  now: string,
): Project {
  const $ = cheerio.load(html);
  const ld = jsonLd($);
  const listing = ld.find((x) => /RealEstateListing|Product|Residence|Apartment/.test(String(x['@type']))) as
    | { name?: string; image?: string | string[]; offers?: { price?: string | number } }
    | undefined;
  const video = ld.find((x) => x['@type'] === 'VideoObject') as { embedUrl?: string } | undefined;

  const content = $('.pd-single-content').first();
  const name =
    orNull(content.find('h1').first().text()) ?? orNull($('.wcr-fs-name').first().text()) ?? orNull(listing?.name) ?? meta.slug;

  const address = (
    orNull(content.find('p:has(i.fa-map-marker-alt)').first().text()) ?? orNull($('.wcr-fs-loc').first().text())
  )?.replace(/[,\s]+$/, '') ?? null;

  const devP = content.find('p').filter((_, p) => /Developer:/i.test($(p).text())).first();
  const devA = devP.find('a').first();
  const developer = orNull(devA.text()) ?? orNull(devP.text().replace(/Developer:/i, ''));
  const developerUrl = abs(devA.attr('href'));

  // Description: paragraphs after the title line inside the about block.
  const descParas: string[] = [];
  const titleLine = content.find('.title-line').first();
  (titleLine.length ? titleLine.nextAll('p') : content.find('p').slice(2)).each((_, p) => {
    const t = oneLine($(p).text());
    if (t && !/^Developer:/i.test(t)) descParas.push(t);
  });
  const description = descParas.length ? descParas.join('\n\n') : null;

  const brochureHref = content
    .find('a[href]')
    .map((_, a) => $(a).attr('href'))
    .get()
    .find((h) => /\.pdf(\?|$)/i.test(h ?? ''));

  // Spec card: price + "Label<br/><strong>Value</strong>" items.
  const info = $('.pd-single-info').first();
  const priceText = orNull(info.find('.price').first().text());
  const spec = new Map<string, string>();
  info.find('ul li').each((_, li) => {
    const val = oneLine($(li).find('strong').text());
    const label = oneLine($(li).clone().find('strong, span').remove().end().text()).toLowerCase();
    if (label && val) spec.set(label, val);
  });

  // First-screen chips: "Price: …", "Configurations: …", "Possession: …".
  const chips = new Map<string, string>();
  $('.wcr-fs-facts li').each((_, li) => {
    const lab = oneLine($(li).find('.wcr-fs-sr').text()).replace(/:$/, '').toLowerCase();
    const val = oneLine($(li).clone().find('.wcr-fs-sr').remove().end().text());
    if (lab && val) chips.set(lab, val);
  });
  const chipPossession = chips.get('possession') ?? null;
  const [chipStatus, chipDate] = chipPossession ? chipPossession.split(/\s*·\s*/) : [null, null];

  const { table: sizesTable, configurations } = parseSizesTable($);
  const sizesNotes = (() => {
    const box = $('#floorplan .text').first().clone();
    box.find('table').remove();
    return orNull(box.text());
  })();

  const highlights = tabPaneItems($, /Highlights/i);
  const amenities = tabPaneItems($, /Amenities/i);
  const locationAdvantages = listItems($, $('#location .map-frame-content'));
  const features: FeatureItem[] = $('.map-feature li')
    .map((_, li) => {
      const title = oneLine($(li).find('h1,h2,h3,h4,strong').first().text());
      const text = orNull($(li).find('p').text());
      return title ? { title, text } : text ? { title: text, text: null } : null;
    })
    .get()
    .filter(Boolean) as FeatureItem[];

  const faqs: Faq[] = $('#faqAccordion .panel')
    .map((_, p) => {
      const q = oneLine($(p).find('.panel-title').text()).replace(/^Q:\s*/i, '');
      const a = oneLine($(p).find('.panel-body').text()).replace(/^A:\s*/i, '');
      return q ? { q, a } : null;
    })
    .get()
    .filter(Boolean) as Faq[];

  const gallery = uniq(
    $('.pro-images a[href], .pro-images-com a[href]')
      .map((_, a) => abs($(a).attr('href')))
      .get()
      .filter(Boolean) as string[],
  );
  const ldImage = Array.isArray(listing?.image) ? listing?.image[0] : listing?.image;
  const mainImage = abs(ldImage) ?? abs($('meta[property="og:image"]').attr('content')) ?? gallery[0] ?? null;

  let floorPlans: FloorPlan[] = $('#floorplan #tab-img li[data-src]')
    .map((_, li) => ({ label: orNull($(li).text()), url: abs($(li).attr('data-src')) }))
    .get()
    .filter((f) => f.url) as FloorPlan[];
  if (!floorPlans.length) {
    const u = abs($('#floorplan #ek-model a').attr('href') ?? $('#floorplan #ek-model img').attr('src'));
    if (u) floorPlans = [{ label: null, url: u }];
  }
  const locationMapImage = abs($('#location .map-frame a').attr('href') ?? $('#location .map-frame img').attr('src'));

  const videoSrc =
    video?.embedUrl ?? $('iframe[src*="youtube.com/embed"]').first().attr('src')?.split('?')[0] ?? null;

  // Headline price: JSON-LD numeric price wins, else parse the text.
  const ldPrice = Number(listing?.offers?.price);
  const parsedHeadline = parseInrRange(priceText);
  const priceInr = Number.isFinite(ldPrice) && ldPrice > 0 ? ldPrice : parsedHeadline?.min ?? null;
  const allPrices = [
    ...(priceInr ? [priceInr] : []),
    ...(parsedHeadline ? [parsedHeadline.min, parsedHeadline.max] : []),
    ...configurations.map((c) => c.priceInr).filter((v): v is number => v !== null),
  ];

  const textPool = [description ?? '', ...highlights, ...faqs.map((f) => `${f.q} ${f.a}`), ...locationAdvantages];
  const factPool = [...highlights, description ?? '', ...features.map((f) => `${f.title} ${f.text ?? ''}`), ...faqs.map((f) => f.a)];

  const { sector, road, city } = parseAddress(address);

  return {
    slug: meta.slug,
    sourceUrl: meta.url,
    category: meta.category,
    pageTitle: orNull($('title').first().text()),
    name,
    developer,
    developerUrl,
    address,
    sector,
    road,
    city,
    propertyType: spec.get('type') ?? null,
    configurationSummary: spec.get('size') ?? chips.get('configurations') ?? null,
    areaText: spec.get('area') ?? null,
    configurations,
    sizesTable,
    sizesNotes,
    priceText: priceText ?? chips.get('price') ?? null,
    priceInr,
    priceMinInr: allPrices.length ? Math.min(...allPrices) : null,
    priceMaxInr: allPrices.length ? Math.max(...allPrices) : null,
    ...(() => {
      let status = spec.get('status') ?? orNull(chipStatus);
      let possession = spec.get('possession') ?? orNull(chipDate);
      if (isDateOnly(status)) {
        possession = possession ?? status;
        status = null;
      }
      return { status, possession };
    })(),
    reraNumbers: findReraNumbers(textPool),
    landArea: findFact(factPool, /(\d+(?:\.\d+)?)\s*\+?\s*acres?\b/i, (m) => `${m[1]} acres`),
    towers: findFact(factPool, /(\d+)\s*\+?\s*(?:high[- ]rise\s+|residential\s+)?towers\b/i, (m) => `${m[1]} towers`),
    units: findFact(
      factPool,
      /(\d[\d,]*)\s*\+?\s*(?:exclusive\s+|luxury\s+|premium\s+)?(units|apartments|residences|flats|homes|shops|villas)\b/i,
      (m) => `${m[1]} ${m[2].toLowerCase()}`,
    ),
    description,
    highlights,
    amenities,
    locationAdvantages,
    features,
    faqs,
    mainImage,
    gallery,
    floorPlans,
    locationMapImage,
    brochureUrl: abs(brochureHref),
    videoUrl: videoSrc,
    pageCoordinates: findPageCoordinates($, html),
    active: true,
    firstSeenAt: now,
    lastSeenAt: now,
    scrapedAt: now,
  };
}

// ───────────────────────── contact page ─────────────────────────

export function parseOffice(html: string, url: string): Office & { pageGeo: { lat: number; lng: number } | null } {
  const $ = cheerio.load(html);
  const org = jsonLd($).find((x) => (x as { address?: unknown }).address) as
    | { name?: string; telephone?: string; address?: { streetAddress?: string }; geo?: { latitude?: string; longitude?: string } }
    | undefined;
  const visible = oneLine($('address:has(i.fa-map-marker-alt)').first().text());
  const address = visible || oneLine(org?.address?.streetAddress) || '';
  const phones = uniq(
    $('a[href^="tel:"]')
      .map((_, a) => oneLine($(a).text()))
      .get()
      .filter((t) => /\d{6,}/.test(t.replace(/\D/g, ''))),
  );
  const g = org?.geo;
  return {
    name: org?.name ?? 'White Collar Realty',
    address,
    phones,
    sourceUrl: url,
    lat: null,
    lng: null,
    locationAccuracy: null,
    pageGeo: g?.latitude && g?.longitude ? { lat: +g.latitude, lng: +g.longitude } : null,
  };
}
