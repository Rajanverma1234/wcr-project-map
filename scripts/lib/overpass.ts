// Overpass API client (moved out of fetch-nearby.ts so other scripts can reuse it).
// One request at a time, ≥5 s apart, identifying User-Agent, backoff on 429/502/504,
// rotating public mirrors. Responses are cached in data/osm-cache/<key>.json and
// reused while the query text is unchanged.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_AGENT } from './http.ts';

export const CACHE_DIR = 'data/osm-cache';
export const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

export type Tags = Record<string, string>;
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Tags;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; role: string; geometry?: { lat: number; lon: number }[] }[];
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
export const overpassStats = { live: 0, cached: 0 };

/** Run an Overpass QL body (without the [out:…] header) and cache it under `key`. */
export async function overpass(key: string, body: string, opts: { refresh?: boolean; out?: string; timeout?: number } = {}): Promise<OsmElement[]> {
  const file = join(CACHE_DIR, `${key}.json`);
  const query = `[out:json][timeout:${opts.timeout ?? 120}];(${body});${opts.out ?? 'out center tags;'}`;
  if (!opts.refresh && existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, 'utf8'));
    if (cached.query === query) {
      overpassStats.cached++;
      console.log(`  ${key}: cache (${cached.elements.length} elements, fetched ${cached.fetchedAt})`);
      return cached.elements;
    }
  }
  const maxAttempts = 9;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    const gap = lastRequest + 5000 - Date.now();
    if (gap > 0) await sleep(gap);
    lastRequest = Date.now();
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(((opts.timeout ?? 120) + 30) * 1000),
      });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith('{')) throw new Error(`HTTP ${res.status}: ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
      const json = JSON.parse(text) as { elements: OsmElement[]; remark?: string };
      if (json.remark && /runtime error|timed out/i.test(json.remark)) throw new Error(`Overpass remark: ${json.remark}`);
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(file, JSON.stringify({ query, endpoint, fetchedAt: new Date().toISOString(), elements: json.elements }));
      overpassStats.live++;
      console.log(`  ${key}: ${json.elements.length} elements from ${new URL(endpoint).host}`);
      return json.elements;
    } catch (err) {
      const wait = Math.min(15_000 * 2 ** Math.floor(attempt / ENDPOINTS.length), 120_000);
      console.warn(`  ${key}: ${new URL(endpoint).host} failed (${(err as Error).message}); retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`Overpass: gave up on "${key}" after ${maxAttempts} attempts`);
}
