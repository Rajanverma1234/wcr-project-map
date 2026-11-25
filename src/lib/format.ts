import type { MappedProject } from '../../shared/types.ts';

export const ON_REQUEST = 'Details on request';

export function formatInr(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, '');
  if (n >= 1e7) return `₹ ${trim(n / 1e7)} Cr`;
  if (n >= 1e5) return `₹ ${trim(n / 1e5)} Lakh`;
  return `₹ ${n.toLocaleString('en-IN')}`;
}

export type StatusKey = 'New Launch' | 'Under Construction' | 'Ready to Move' | 'Other' | 'On request';

export function statusKey(status: string | null): StatusKey {
  if (!status) return 'On request';
  if (/ready|delivered|possession\s*(started|given)|completed|\boc\b/i.test(status)) return 'Ready to Move';
  if (/launch|pre[- ]?launch|eoi|booking/i.test(status)) return 'New Launch';
  if (/under\s*constr|construction|ongoing/i.test(status)) return 'Under Construction';
  return 'Other';
}

export const STATUS_COLORS: Record<StatusKey, string> = {
  'New Launch': '#7c3aed',
  'Under Construction': '#d97706',
  'Ready to Move': '#059669',
  Other: '#2563eb',
  'On request': '#6b7280',
};

export const STATUS_ORDER: StatusKey[] = ['New Launch', 'Under Construction', 'Ready to Move', 'Other', 'On request'];

/** Product type for filtering, derived only from the page's own Type/Size wording. */
export type Kind = 'Apartments' | 'Builder Floors' | 'Villas' | 'Plots' | 'SCO' | 'Commercial';
export function kindOf(p: MappedProject): Kind {
  const t = `${p.propertyType ?? ''} ${p.configurationSummary ?? ''} ${p.name}`;
  if (/\bSCO\b|shop[\s-]*cum[\s-]*office/i.test(t)) return 'SCO';
  if (p.category === 'commercial') return 'Commercial';
  if (/\bplots?\b/i.test(t)) return 'Plots';
  if (/builder\s*floors?|independent\s*floors?|\bfloors\b/i.test(t)) return 'Builder Floors';
  if (/\bvillas?\b/i.test(t)) return 'Villas';
  return 'Apartments';
}

/** BHK counts mentioned in the Size field or configuration rows, e.g. "3, 4 & 5 BHK" → [3,4,5]. */
export function bhksOf(p: MappedProject): number[] {
  const texts = [p.configurationSummary ?? '', ...p.configurations.map((c) => c.type)];
  const out = new Set<number>();
  for (const t of texts) {
    const re = /((?:\d(?:\.5)?\s*(?:,|&|and|\/|-|to|or)?\s*)+)\s*BHK/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const seg = m[1];
      const nums = (seg.match(/\d(?:\.5)?/g) ?? []).map(Number);
      if (/\d\s*(-|to)\s*\d/.test(seg) && nums.length === 2) {
        for (let n = Math.floor(nums[0]); n <= nums[1]; n++) out.add(n);
      } else nums.forEach((n) => out.add(Math.floor(n)));
    }
  }
  return [...out].filter((n) => n >= 1 && n <= 8).sort((a, b) => a - b);
}

export const PRICE_BUCKETS = [
  { id: 'lt1', label: 'Under ₹1 Cr', min: 0, max: 1e7 },
  { id: '1-2', label: '₹1–2 Cr', min: 1e7, max: 2e7 },
  { id: '2-5', label: '₹2–5 Cr', min: 2e7, max: 5e7 },
  { id: '5-10', label: '₹5–10 Cr', min: 5e7, max: 1e8 },
  { id: 'gt10', label: '₹10 Cr+', min: 1e8, max: Infinity },
  { id: 'na', label: 'Price on request', min: NaN, max: NaN },
] as const;
export type PriceBucketId = (typeof PRICE_BUCKETS)[number]['id'];

export function priceBucketOf(p: MappedProject): PriceBucketId {
  const v = p.priceInr;
  if (v === null || !Number.isFinite(v)) return 'na';
  return PRICE_BUCKETS.find((b) => b.id !== 'na' && v >= b.min && v < b.max)!.id;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
