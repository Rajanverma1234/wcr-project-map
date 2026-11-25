// Shared data model for scraped projects. Used by the scripts and the frontend.
// Every field comes from the project's page on whitecollarrealty.com; anything
// the page does not show is null (or an empty array), never a guessed value.

export type Category = 'residential' | 'commercial';
export type LocationAccuracy = 'exact' | 'geocoded' | 'sector-approx';
/** Where the pin came from. A manual override counts as "exact". */
export type LocationSource =
  | 'override'
  | 'page'
  | 'osm-name'
  | 'nominatim-project'
  | 'nominatim-sector'
  | 'nominatim-locality' // sector is in Sohna/Gwal Pahari numbering: pinned at that locality
  | 'nominatim-area';

export interface Configuration {
  /** Row label as shown, e.g. "3 BHK", "Retail Shop" */
  type: string;
  /** Size as shown, e.g. "2450 Sq. Ft." */
  sizeText: string | null;
  /** Numeric size in sq ft when the text holds one number; ranges keep min. */
  sizeSqftMin: number | null;
  sizeSqftMax: number | null;
  /** Price as shown, e.g. "₹4.56 Cr." */
  priceText: string | null;
  priceInr: number | null;
}

export interface FeatureItem {
  title: string;
  text: string | null;
}

export interface Faq {
  q: string;
  a: string;
}

export interface FloorPlan {
  label: string | null;
  url: string;
}

/** A value pulled out of free text, kept with the sentence it came from. */
export interface TextFact {
  value: string;
  evidence: string;
}

export interface Project {
  slug: string;
  sourceUrl: string;
  category: Category;
  /** The page's <title>; often names the road (used only for corridor grouping). */
  pageTitle: string | null;

  name: string;
  developer: string | null;
  developerUrl: string | null;
  /** Address line exactly as shown, e.g. "Sector 106, Dwarka Expressway, Gurgaon" */
  address: string | null;
  /** e.g. "Sector 106" (parsed from the address line) */
  sector: string | null;
  /** Road/corridor part of the address line as shown, e.g. "Dwarka Expressway" */
  road: string | null;
  city: string | null;

  /** "Type" field, e.g. "Ultra Luxury Residences" */
  propertyType: string | null;
  /** "Size" field, e.g. "3, 4 & 5 BHK Apt." */
  configurationSummary: string | null;
  /** "Area" field, e.g. "2,450 - 7,362 Sq.ft." */
  areaText: string | null;
  /** Rows derived from the sizes table when it has size/price columns. */
  configurations: Configuration[];
  /** The "Sizes & Floor Plan" table exactly as shown (some are rate cards, e.g. BSP per sq ft). */
  sizesTable: { headers: string[]; rows: string[][] } | null;
  /** Notes printed around the sizes table, e.g. "Payment Plan- 30:30:40" */
  sizesNotes: string | null;

  /** Headline price as shown, e.g. "₹ 6.5 Cr." */
  priceText: string | null;
  /** Starting price in INR: from JSON-LD offers.price, else parsed from priceText */
  priceInr: number | null;
  /** Min/max over the headline price and the configuration prices */
  priceMinInr: number | null;
  priceMaxInr: number | null;

  status: string | null;
  possession: string | null;

  reraNumbers: TextFact[];
  landArea: TextFact | null;
  towers: TextFact | null;
  units: TextFact | null;

  description: string | null;
  highlights: string[];
  amenities: string[];
  locationAdvantages: string[];
  features: FeatureItem[];
  faqs: Faq[];

  mainImage: string | null;
  gallery: string[];
  floorPlans: FloorPlan[];
  locationMapImage: string | null;
  brochureUrl: string | null;
  videoUrl: string | null;

  /** Coordinates embedded in the page itself, if any (none seen so far). */
  pageCoordinates: { lat: number; lng: number; source: string } | null;

  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  scrapedAt: string;
}

export interface Office {
  name: string;
  address: string;
  phones: string[];
  sourceUrl: string;
  lat: number | null;
  lng: number | null;
  locationAccuracy: LocationAccuracy | null;
  locationSource?: LocationSource | null;
  locationNote?: string | null;
}

/** Shape of public/data/projects.geo.json consumed by the map. */
export interface MappedProject extends Project {
  lat: number | null;
  lng: number | null;
  locationAccuracy: LocationAccuracy | null;
  locationSource: LocationSource | null;
  /** Human-readable explanation of the pin, e.g. "Centre of Sector 106 (approximate)" */
  locationNote: string | null;
  /** Canonical corridor for filter chips; `road` keeps the site's own wording. */
  corridor: string | null;
}

// ───────────── Nearby places ─────────────

export type PoiCategory =
  | 'metro'
  | 'railway'
  | 'airport'
  | 'mall'
  | 'hospital'
  | 'school'
  | 'college'
  | 'park'
  | 'bank'
  | 'fuel';

export interface Poi {
  id: string; // "osm:node/123" or "manual:<slug>"
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  source: 'osm' | 'manual';
  /** Large multi-specialty hospital (set in data/landmarks-manual.json). */
  major?: boolean;
}

export interface NearbyItem {
  poiId: string;
  name: string;
  category: PoiCategory;
  lat: number;
  lng: number;
  straightKm: number;
  driveKm: number | null;
  driveMin: number | null;
  major?: boolean;
}

export interface ProjectNearby {
  slug: string;
  /** Coordinates the distances were computed from (recompute when they change). */
  lat: number;
  lng: number;
  computedAt: string;
  items: NearbyItem[];
  /** Nearest "major" hospital (any distance), for the summary row. */
  majorHospital: NearbyItem | null;
}

export interface MapData {
  generatedAt: string;
  source: string;
  office: Office | null;
  projects: MappedProject[];
}
