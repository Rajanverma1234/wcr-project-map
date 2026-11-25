// Polite sequential HTTP client: one request at a time, a fixed gap between
// requests, retries with exponential backoff, and a clear User-Agent.

export const USER_AGENT =
  'WCRProjectsMapBot/1.0 (internal project-map data refresh; respects robots.txt)';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class PoliteClient {
  private last = 0;
  constructor(
    private readonly minGapMs = 1500,
    private readonly maxRetries = 3,
  ) {}

  async get(url: string, accept = 'text/html'): Promise<string> {
    let attempt = 0;
    for (;;) {
      const wait = this.last + this.minGapMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT, Accept: accept },
          redirect: 'follow',
          signal: AbortSignal.timeout(30_000),
        });
        if (res.status === 404 || res.status === 410) {
          throw Object.assign(new Error(`HTTP ${res.status} for ${url}`), { permanent: true });
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.text();
      } catch (err) {
        const permanent = (err as { permanent?: boolean }).permanent;
        if (permanent || attempt >= this.maxRetries) throw err;
        const backoff = 2000 * 2 ** attempt;
        console.warn(`  retry ${attempt + 1}/${this.maxRetries} in ${backoff}ms: ${(err as Error).message}`);
        await sleep(backoff);
        attempt++;
      }
    }
  }
}
