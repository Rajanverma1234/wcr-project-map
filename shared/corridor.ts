// Groups the site's different spellings of a road into one filter chip.
// Only uses words that appear on the project page (road/address); it never
// infers a corridor from the sector number.

const RULES: [RegExp, string][] = [
  [/golf\s*course\s*(ext|extn|extension)/i, 'Golf Course Extension Road'],
  [/golf\s*course/i, 'Golf Course Road'],
  [/dwarka\s*(e?xp|expressway|express\s*way)|dwarka\s*e-?way/i, 'Dwarka Expressway'],
  [/southern\s*peripheral|\bspr\b/i, 'Southern Peripheral Road (SPR)'],
  [/northern\s*peripheral|\bnpr\b/i, 'Northern Peripheral Road (NPR)'],
  [/sohna\s*(road|rd)/i, 'Sohna Road'],
  [/\bsohna\b/i, 'Sohna'],
  [/\bnh[\s-]*(48|8)\b|national\s*highway|delhi[\s-]*jaipur/i, 'NH-48'],
  [/new\s*(gurgaon|gurugram)/i, 'New Gurgaon'],
  [/\bmg\s*road\b|mehrauli[\s-]*gurgaon/i, 'MG Road'],
  [/cyber\s*city|dlf\s*cyber/i, 'Cyber City'],
  [/pataudi/i, 'Pataudi Road'],
  [/old\s*(gurgaon|gurugram)/i, 'Old Gurgaon'],
  [/faridabad/i, 'Gurgaon–Faridabad Road'],
  [/\bkmp\b|kundli|manesar/i, 'Manesar / KMP'],
  [/udyog\s*vihar/i, 'Udyog Vihar'],
  [/sushant\s*lok/i, 'Sushant Lok'],
  [/dlf\s*phase|golf\s*links/i, 'DLF Phase 1–5'],
  [/gwal\s*pah(a)?ri/i, 'Gwal Pahari'],
  [/badshahpur/i, 'Badshahpur'],
  [/nirvana\s*country/i, 'Nirvana Country'],
  [/\bdxp\b/i, 'Dwarka Expressway'],
];

/**
 * Canonical corridor from, in order: the address road part, the full address,
 * then the page <title>. All three are the website's own text.
 */
export function canonicalCorridor(road: string | null, address: string | null, pageTitle: string | null = null): string | null {
  for (const text of [road, address, pageTitle]) {
    if (!text) continue;
    for (const [re, name] of RULES) if (re.test(text)) return name;
  }
  if (!road) return null;
  // Unknown road: keep the site's wording, tidied.
  return road.replace(/\s+/g, ' ').replace(/\.$/, '').trim() || null;
}
