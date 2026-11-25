// Name matching and sector checks for project pins (pure functions, unit-tested).

// ───────────── names ─────────────

/** Words removed for the similarity score only (they carry little identity). */
export const SCORE_STOPWORDS = new Set([
  'phase', 'tower', 'towers', 'residences', 'residence', 'residency', 'apartments', 'apartment', 'apts',
  'the', 'by', 'at', 'of', 'and', 'in', 'homes', 'floors', 'suites', 'project', 'new', 'luxury', 'premium',
]);
/** Words that never make a name distinctive (on top of SCORE_STOPWORDS and the developer). */
const NON_DISTINCTIVE = new Set([...SCORE_STOPWORDS, 'gurgaon', 'gurugram', 'sector', 'haryana', 'india', 'estate', 'park', 'city', 'plaza', 'mall', 'group', 'ltd', 'pvt']);

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };

/**
 * Lowercase, strip punctuation, "gurgaon"/"gurugram", "sector N", and turn
 * "phase II" into "phase 2". Keeps numbers (they matter: "360" ≠ "361").
 */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bsector[\s-]*\d+[a-z]?\b/g, ' ')
    .replace(/\b(gurgaon|gurugram|haryana|india)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(phase|part|tower)\s+(i{1,3}|iv|v|vi)\b/g, (_, w, r) => `${w} ${ROMAN[r]}`)
    .replace(/\s+/g, ' ')
    .trim();
}

export const tokens = (s: string) => normalise(s).split(' ').filter(Boolean);

/** Tokens used for scoring: normalised, without generic words. */
export const scoreTokens = (s: string) => tokens(s).filter((t) => !SCORE_STOPWORDS.has(t));

/** Tokens that must all appear in a candidate: not generic, not the developer's name. */
export function distinctiveTokens(projectName: string, developer: string | null): string[] {
  const dev = new Set(developer ? tokens(developer) : []);
  // Single letters are noise, but every number counts ("Golf Estate 2" ≠ "Golf Estate").
  return [...new Set(tokens(projectName).filter((t) => !NON_DISTINCTIVE.has(t) && !dev.has(t) && (t.length > 1 || /^\d$/.test(t))))];
}

/** Name without a leading developer prefix: "M3M Golf Estate" → "Golf Estate". */
export function stripDeveloper(projectName: string, developer: string | null): string | null {
  if (!developer) return null;
  const dev = tokens(developer);
  const words = projectName.replace(/[-–—:|]+/g, ' ').trim().split(/\s+/);
  let i = 0;
  while (i < words.length && dev.includes(normalise(words[i]))) i++;
  const rest = words.slice(i).join(' ').trim();
  return i > 0 && rest && normalise(rest) !== normalise(projectName) ? rest : null;
}

// Levenshtein ratio as in fuzzywuzzy (substitution cost 2): 1 = identical.
function ratio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2));
    }
    prev = cur;
  }
  return (a.length + b.length - prev[b.length]) / (a.length + b.length);
}

/** Token-set ratio (0–1) on score tokens. Order-insensitive; a subset scores 1. */
export function similarity(a: string, b: string): number {
  const A = new Set(scoreTokens(a));
  const B = new Set(scoreTokens(b));
  if (!A.size || !B.size) return 0;
  const inter = [...A].filter((t) => B.has(t)).sort();
  const restA = [...A].filter((t) => !B.has(t)).sort();
  const restB = [...B].filter((t) => !A.has(t)).sort();
  const t0 = inter.join(' ');
  const t1 = [t0, ...restA].filter(Boolean).join(' ');
  const t2 = [t0, ...restB].filter(Boolean).join(' ');
  const scores = [ratio(t1, t2)];
  if (t0) scores.push(ratio(t0, t1), ratio(t0, t2));
  return Math.max(...scores);
}

/** Every distinctive token of the project appears in the candidate name. */
export function hasAllDistinctive(distinctive: string[], candidateName: string): boolean {
  if (!distinctive.length) return false; // nothing identifies the project: never auto-match
  const c = new Set(tokens(candidateName));
  return distinctive.every((t) => c.has(t));
}

/** Numbers in the name (phase 2, 360, 2…) must agree: "Phase 2" never matches "Phase 1". */
export function numbersCompatible(projectName: string, candidateName: string): boolean {
  const nums = (s: string) => tokens(s).filter((t) => /^\d+$/.test(t));
  const p = nums(projectName);
  const c = nums(candidateName);
  if (!c.length) return true; // candidate has no number: decided by the distinctive-token rule
  return c.every((n) => p.includes(n));
}

export interface NameCheck {
  score: number;
  allDistinctive: boolean;
  numbersOk: boolean;
}
export function checkName(projectName: string, developer: string | null, candidateName: string): NameCheck {
  const distinctive = distinctiveTokens(projectName, developer);
  const numbersOk = numbersCompatible(projectName, candidateName);
  return {
    score: numbersOk ? similarity(projectName, candidateName) : 0,
    allDistinctive: hasAllDistinctive(distinctive, candidateName),
    numbersOk,
  };
}

// ───────────── geometry ─────────────

export type LatLng = { lat: number; lng: number };
/** A polygon as a bag of edges (rings in any order; holes included). */
export type Edges = [LatLng, LatLng][];

export function km(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Even–odd ray casting over all edges. Works for multipolygons whose outer and
 * inner rings come as separate, unordered way segments (as Overpass returns them).
 */
export function pointInEdges(p: LatLng, edges: Edges): boolean {
  let inside = false;
  for (const [a, b] of edges) {
    if (a.lat > p.lat !== b.lat > p.lat) {
      const x = a.lng + ((p.lat - a.lat) / (b.lat - a.lat)) * (b.lng - a.lng);
      if (p.lng < x) inside = !inside;
    }
  }
  return inside;
}

export type SectorCheck =
  | { kind: 'polygon'; edges: Edges[]; centre: LatLng; label: string }
  | { kind: 'radius'; centre: LatLng; radiusKm: number; label: string };

export function insideSector(p: LatLng, check: SectorCheck): boolean {
  if (check.kind === 'radius') return km(p, check.centre) <= check.radiusKm;
  return check.edges.some((e) => pointInEdges(p, e));
}

/** "Sector 15", "Sector-15", "Sector 15-II", "Sector 15 Part 2", "Sector 63A" → "15" / "63A" (null if not a sector name). */
export function sectorKey(name: string): string | null {
  const m = name.trim().match(/^sector[\s-]*(\d+)\s*([a-z])?(?:[\s-]*(?:part[\s-]*)?(?:i{1,3}|iv|\d))?$/i);
  return m ? `${m[1]}${(m[2] ?? '').toUpperCase()}` : null;
}
