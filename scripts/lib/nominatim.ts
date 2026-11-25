// Nominatim client shared by the geocoding scripts.
//  • real throttle: every request waits until ≥ minGapMs after the previous one started
//  • disk cache keyed by a caller-chosen key (default: the exact query string)
//  • counts live requests and cache hits
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Contact for the Nominatim User-Agent comes from the environment or a git-ignored .env
// file (WCR_CONTACT=…). It is never hard-coded. Without it, live requests are refused
// (cached answers still work).
if (!process.env.WCR_CONTACT && existsSync('.env')) {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* unreadable .env: treated as unset */
  }
}
export const WCR_CONTACT = (process.env.WCR_CONTACT ?? '').replace(/[^\x20-\x7e]/g, '').trim(); // headers must be ASCII
export const NOMINATIM_UA = `wcr-projects-map/1.0 (contact: ${WCR_CONTACT || 'unset'})`;

export interface NominatimHit {
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  class?: string;
  type: string;
  addresstype?: string;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
  address?: Record<string, string>;
}

export class NominatimClient {
  private cache: Record<string, NominatimHit[]>;
  private nextAt = 0;
  live = 0;
  hits = 0;

  constructor(
    private readonly cacheFile: string,
    private readonly baseParams: Record<string, string>,
    private readonly opts: { userAgent?: string; minGapMs?: number; key?: (q: string) => string; requireContact?: boolean } = {},
  ) {
    this.cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
  }

  private key(q: string) {
    return this.opts.key ? this.opts.key(q) : q;
  }

  isCached(q: string) {
    return this.key(q) in this.cache;
  }

  async search(q: string): Promise<NominatimHit[]> {
    const k = this.key(q);
    if (k in this.cache) {
      this.hits++;
      return this.cache[k];
    }
    if (this.opts.requireContact !== false && !WCR_CONTACT)
      throw new Error(
        `WCR_CONTACT is not set, so no live Nominatim request is made (query not in cache: "${q}"). ` +
          'Add WCR_CONTACT=<contact url or email> to .env or the environment.',
      );
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ ...this.baseParams, q }).toString();
    for (let attempt = 0; ; attempt++) {
      // Throttle: reserve the next slot before awaiting, so concurrent callers queue too.
      const now = Date.now();
      const slot = Math.max(now, this.nextAt);
      this.nextAt = slot + (this.opts.minGapMs ?? 1100);
      if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': this.opts.userAgent ?? NOMINATIM_UA, 'Accept-Language': 'en' },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
        const hits = (await res.json()) as NominatimHit[];
        this.live++;
        this.cache[k] = hits;
        if (this.live % 10 === 0) this.save();
        return hits;
      } catch (err) {
        if (attempt >= 3) throw err;
        this.nextAt = Date.now() + 3000 * 2 ** attempt; // back off, still through the throttle
      }
    }
  }

  save() {
    mkdirSync(dirname(this.cacheFile), { recursive: true });
    writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 1));
  }
}
