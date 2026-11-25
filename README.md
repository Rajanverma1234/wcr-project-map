# White Collar Realty — Gurugram Projects Map

An interactive map of every Gurugram project listed on
[whitecollarrealty.com/gurgaon-projects](https://whitecollarrealty.com/gurgaon-projects),
with the details shown on each project's own page.

**No made-up data.** Every value comes from the project's page on the website.
Anything the page doesn't show is stored as `null` and shown as
*"Details on request"*. Each project keeps its `sourceUrl` so it can be checked.

## Setup

Requires Node.js 20+ (built with Node 22).

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # → dist/ (static files; host anywhere)
npm run preview    # http://localhost:4173
```

## Updating the data

```bash
npm run data:update     # scrape the website → geocode → nearby places → distances
```

or step by step:

| Command | What it does |
|---|---|
| `npm run scrape` | Reads `/gurgaon-projects`, fetches every project page (one request every 1.5 s, retries with backoff), writes `data/projects.json`, `data/office.json`, `data/scrape-report.md` |
| `npm run scrape -- --only=slug1,slug2` | Re-scrape specific projects only |
| `npm run scrape -- --cache` | Re-parse the saved pages in `data/raw/` without hitting the website |
| `npm run scrape -- --scope=all` | Use `/all-projects` (389 projects, including Dubai, Noida, Goa…) instead of Gurgaon only |
| `npm run pins:osm` | Strict OSM name matching for project pins (dry run; `-- --apply` to write). See "Project pins" below |
| `npm run geocode` | Adds map positions (override > OSM match > sector centre), writes `public/data/projects.geo.json` (what the app loads) and `data/geocode-summary.md` |
| `npm run pins:import` | Imports pins you fill into `data/manual-pin-todo.csv` (dry run; `-- --apply` to write) |
| `npm run verify` | Compares the project count with the website and spot-checks 5 random projects field by field against their live pages → `data/verify-report.md` |
| `npm run build && npm run check:app` | Opens the built app in Edge/Chrome: no console errors, every project has a pin, deep links, mobile layout |
| `npm test` | Parser tests against real saved pages in `tests/fixtures/` |

Re-scraping is safe. Projects are matched by `sourceUrl`: existing ones are updated,
new ones are added, and projects that disappear from the website are kept but
marked `"active": false` (hidden on the map). Partial runs (`--only`, `--limit`)
never mark anything inactive.

## Project pins: precedence

Every project's pin comes from the first source that has one:

1. **Manual override**: `data/location-overrides.json`. Always wins and is never written by a script, except `pins:import --apply` when you ask it to.
2. **Strict OpenStreetMap name match**: `data/location-geocoded.json`, written by `npm run pins:osm -- --apply`.
3. **Sector centre** (or the area named in the address when there is no sector).

| Accuracy in the app | Meaning | Note in the details panel |
|---|---|---|
| manual (`exact` + source `override`) | Pinned by hand | None |
| exact | OSM outline of the site (residential/commercial area, building, construction site) | None |
| geocoded | OSM point (node) for the project | "Pin from map data; may be off by a few hundred metres" |
| sector (`sector-approx`) | Sector or area centre | Rough-guide warning, plus a halo on the pin |

### Sector rule (one rule for sector pins, `pins:osm` and `pins:import`)

`scripts/lib/sectorpick.ts`, used by `geocode`, `pins:osm` and `pins:import`. Run `npm run sectors:audit` for a read-only table of every candidate.

* Several OSM objects share a name like "Sector 15". Only those inside **Gurugram district** count; Dwarka (Delhi) has its own Sectors 2, 22, 24 and 28.
* **Manesar** town or IMT sectors are used only when the project's text says Manesar. This stops Gurugram's Sector 15 resolving to Manesar's.
* "Part-2" / "Part II" in the address picks that part (**Sector 15-II**).
* A sector-centre pin keeps its current point if that point is inside the chosen sector polygon. Otherwise it moves to a point guaranteed to be inside the polygon (point-on-surface).
* **Locality rule:** Sohna and Gwal Pahari number their sectors separately. If the address (or a title/description phrase *pairing* the sector with the place, e.g. "Sectors 32 and 33, Sohna") names such a locality, and OSM's "Sector N" is more than 4 km away, the pin goes to that locality (`nominatim-locality`, shown as approximate), and checks use a 4 km circle around it. Road names ("Sohna Road", "Golf Course Extension Road", …) and "near X" never count.
* `data/area-aliases.json` holds the website's spellings OSM doesn't know (e.g. "Gwal Pahri" → "Gwal Pahari"), the locality list, and the road phrases that are never localities. Edit the file, not the code. `npm run areas:report` lists every sector or area string that needed help (`data/area-lookup-report.md`).

### `npm run pins:osm`: OpenStreetMap name search

Dry run by default: it writes the report and changes no pins. Add `-- --apply` to write `data/location-geocoded.json` (matched projects only).

* **Nominatim**: `"<name>, Sector N, Gurugram, Haryana"`, then `"<name>, Gurugram"`, then (only if both are empty) the name without the developer prefix. Requests are throttled to 1 per second and cached per exact query in `data/geocode-cache/nominatim.json`; re-runs make no requests for cached queries.
  **Live requests need `WCR_CONTACT`**, which goes into the User-Agent. Put it in `.env` (git-ignored; see `.env.example`). Without it the script refuses live requests, and cached runs still work.
* **Overpass fallback**: one cached index of named residential, commercial and construction areas, buildings and neighbourhoods (`data/osm-cache/named-places-index.json`), searched locally.
* **Sector check**: the OSM polygon named "Sector N" (`data/osm-cache/sector-polygons.json`), else a 1.5 km circle around the sector centre. A match must also be within 2.5 km of the centre.
* **Name rules** (`scripts/lib/pinmatch.ts`, unit-tested): token-set similarity ≥ 0.90, every distinctive word of the project name present (not the developer, not generic words), and numbers must agree ("Phase 2" ≠ "Phase 1", "360" ≠ "361").
* **matched**: exactly one OSM site passes both the name and location checks. **ambiguous**: several pass, or the name passes but the location fails, or the score is 0.75–0.90. **unmatched**: nothing scores ≥ 0.75.
* Projects with an override are never changed. If OSM confidently disagrees with an override by more than 300 m, the report lists it under "override disagrees".
* Output: `data/geocode-report.md` and `data/manual-pin-todo.csv`. The geocoder's own summary is in `data/geocode-summary.md`.

### `npm run pins:import`: pins you place by hand

1. Open `data/manual-pin-todo.csv`. Projects pinned only at a locality (Sohna / Gwal Pahari, furthest from their real site) come first, then the rest by sector. Each row has the developer and a Google Maps search link.
2. In Google Maps, right-click the project's site and click the coordinates to copy them. Paste them into the `latlng` column (`28.4123, 77.0456`), or fill in `lat` and `lng`.
3. `npm run pins:import` (dry run) lists what would be added and what is rejected, and why:
   - unreadable values
   - lat/lng swapped (rejected, never auto-fixed)
   - outside Gurugram/Manesar
   - outside the project's sector: needs `confirm=yes` in that row
   - project already has an override: needs `confirm=yes` to replace it
4. `npm run pins:import -- --apply` adds the accepted rows to `data/location-overrides.json` (`"locationAccuracy": "manual"`, note `"Google Maps, <date>"`). It then runs `geocode` and `nearby:compute`, which only recomputes projects whose pin moved more than 50 m.

Your typed values survive re-runs of `pins:osm`, which regenerates the CSV.

### What `data:update` runs

`scrape → pins:osm --apply → geocode → nearby:fetch → nearby:compute`. `pins:osm` runs before `geocode`, not after, because `geocode` reads `location-geocoded.json` to place the pins. It is safe to repeat: cached and deterministic, and it never touches overrides (it checks the file is unchanged and stops with an error otherwise).

## Fixing a project's location

Most project pages have no coordinates, so positions come from OpenStreetMap
(Nominatim). Each project has `locationAccuracy`:

| Value | Meaning |
|---|---|
| `exact` | From a manual override (or coordinates embedded in the page) |
| `geocoded` | OpenStreetMap found the project itself, inside its sector |
| `sector-approx` | Centre of the project's sector (or of the area in its address). The app shows an "Approximate location" note and a dashed pin |

To pin a project exactly, open it on Google Maps, right-click the site, and copy
the coordinates. Then add an entry to `data/location-overrides.json`, keyed by
the project slug (the last part of its URL):

```json
{
  "elan-the-presidential": { "lat": 28.5004, "lng": 76.9952, "note": "Checked on Google Maps" },
  "_office": { "lat": 28.39, "lng": 77.06 }
}
```

Then run `npm run geocode`. Overrides always win and are marked `exact`.
`_office` overrides the company office marker. Nominatim answers are cached in
`data/geocode-cache.json`, so re-runs only query new addresses.

Points outside the Gurugram box (lat 28.20–28.56, lng 76.85–77.15) are listed in
`data/geocode-report.md`.

## Nearby places (metro, mall, hospital, school…)

Fetched and calculated when the data is updated, not on every page load. `npm run data:update` runs both steps:

| Command | What it does |
|---|---|
| `npm run nearby:fetch` | Downloads places from OpenStreetMap through the Overpass API: one query per category for the Gurugram box (lat 28.20–28.56, lng 76.85–77.15). Requests go one at a time, ≥5 s apart, with backoff and rotating public mirrors when the server is busy. Raw answers are cached in `data/osm-cache/`; add `--refresh` to re-download, or `--only=metro,mall` for some categories. Writes `data/pois.json` and `data/poi-review.md` |
| `npm run nearby:compute` | For every project: nearest 3 places per category within 10 km (airport and railway: nearest 1, any distance), plus the nearest **major hospital**. Gives straight-line km and drive km/min from the public OSRM server (≤1 request/s, cached in `data/route-cache.json`). Projects are only recomputed when new, when their pin moved, or when `pois.json` changed. Writes `data/nearby.json`, `public/data/nearby.geo.json` and `data/nearby-report.md` |

Rules applied to OpenStreetMap data:

* Only named places. Areas (malls, parks, hospital campuses) use their centre point.
  The same name within 150 m counts once ("Sector 53/54 Metro Station" = "Sector 53-54").
* **Closed places are removed automatically.** This covers lifecycle tags such as
  `disused:amenity=…`, `abandoned:*`, `construction:railway=station`,
  `opening_hours=closed`, a past `end_date`, or "closed" in a note or the name.
  Each one is listed in `data/nearby-report.md` so you can check it.
* **Names that suggest a different kind of place** (clinics, nursing homes,
  playschools, coaching centres, "Dr …" practices) are listed in
  `data/poi-review.md` for a person to decide. They are not removed automatically.
* Drive times are **approx, without traffic**, and the app says so.

### Excluding a wrong place

Add its id (from `data/poi-review.md`, or the OSM link) to `data/poi-exclude.json`:

```json
{ "id": "osm:node/11694035170", "name": "Laxmi Mini Mart", "category": "mall", "reason": "Grocery store tagged shop=mall" }
```

Then run `npm run nearby:fetch && npm run nearby:compute`.

### Adding a landmark manually

`data/landmarks-manual.json` holds key places that OSM may miss or name badly:
the airport, Cyber Hub, Ambience Mall, the big hospitals and HUDA City Centre
metro. A manual entry **replaces** any OSM place of the same category with the
same name or one of its `aliases`. `"major": true` marks a large multi-specialty
hospital; the details panel's summary shows the nearest one as *"Nearest major
hospital"*.

```json
{
  "slug": "max-hospital-gurugram",
  "name": "Max Hospital Gurugram",
  "category": "hospital",
  "major": true,
  "lat": 28.4613236,
  "lng": 77.0747246,
  "aliases": ["Max Hospital"],
  "verifiedWith": "OSM way/308510856 via Nominatim, 2026-11-25"
}
```

Always take coordinates from a verified source, such as Nominatim/OSM or Google
Maps → right-click the building → copy coordinates, and record it in
`verifiedWith`. Never estimate them. An entry with `"lat": null` is skipped with
a warning. **Marengo Asia Hospital (formerly W Pratiksha)** is in the file
like this, because it isn't in OpenStreetMap yet. Paste its verified
coordinates to switch it on.

Categories: `metro`, `railway`, `airport`, `mall`, `hospital`, `school`, `college`, `park`, `bank`, `fuel`.

### On the map

* **Nearby places** (top left): per-category checkboxes for the whole city, all
  off by default. Only places inside the visible area are drawn, and they are
  clustered.
* **Selecting a project** shows its nearby places, 3 km and 5 km rings, and fades
  the other projects. Clicking a place shows its distance and draws a dashed
  line to the project.
* **Details panel → Nearby**: a summary row (metro, mall, major hospital, school,
  airport), then the nearest 3 per category. Click a row to see it on the map;
  "Directions" opens Google Maps. The section is collapsed by default on phones.

Places © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Routing by [OSRM](https://project-osrm.org/) on OpenStreetMap data.

## How fields are extracted

* **Labelled fields** (price, type, size, area, possession, status, developer,
  address) come from the page's spec card.
* **Numeric price** comes from the page's JSON-LD `offers.price`. If that's missing,
  it's parsed from the price text ("₹ 6.5 Cr." → 65,000,000). Text with no unit,
  such as "₹ 6.5 Onwards", is not guessed.
* **Sizes table** is kept exactly as shown. Configuration rows (type, sq ft,
  price) are only built when the table has size or price columns. Commercial
  rate cards (BSP per sq ft) are shown as they are.
* **RERA, land area, towers, units** are not labelled fields on this website.
  They are pulled from the page text (FAQ, highlights, description) and stored
  together with the sentence they came from (hover the value in the app). A
  number is only recorded when the page states one.
* **Status**: some pages put only a date in the Status field ("2032",
  "Q4 2029"). That date is stored as the possession date, and the status
  becomes *on request*.
* **Road / corridor**: `road` is the page's own wording. The filter chips group
  spellings of the same road ("Golf Course Ext. Road", "Golf Course Extn Road"
  → "Golf Course Extension Road") using the address and page title only, never
  the sector number. Projects whose page names no road get no chip.
* **Brochure PDFs** are linked, never downloaded (robots.txt disallows crawling them).

## Folder structure

```
├─ scripts/
│  ├─ scrape-projects.ts   # STEP 1 scraper (listing → detail pages → projects.json)
│  ├─ geocode.ts           # STEP 2 coordinates → public/data/projects.geo.json
│  ├─ geocode-projects.ts  # pins:osm — strict OSM name matching → data/location-geocoded.json
│  ├─ import-pins.ts       # pins:import — manual-pin-todo.csv → location-overrides.json
│  ├─ fetch-nearby.ts      # OSM places (Overpass) → data/pois.json
│  ├─ compute-nearby.ts    # per-project nearest places + OSRM drive distances
│  ├─ verify.ts            # count check + live spot-check report
│  ├─ check-app.ts         # browser check of the built app
│  └─ lib/
│     ├─ http.ts           # polite sequential HTTP client
│     ├─ nominatim.ts      # throttled, cached Nominatim client (WCR_CONTACT)
│     ├─ overpass.ts       # Overpass client: mirrors, backoff, cache
│     ├─ pinmatch.ts       # name normalise/score + point-in-sector (tested)
│     ├─ pinimport.ts      # latlng parsing, swap/bounds checks (tested)
│     ├─ sectors.ts        # sector polygons / 1.5 km radius check
│     ├─ csv.ts            # CSV reader
│     └─ parse.ts          # selectors for whitecollarrealty.com pages
├─ shared/
│  ├─ types.ts             # Project / MappedProject data model
│  └─ corridor.ts          # road-name grouping for filter chips
├─ src/                    # Vite + React + react-leaflet app
│  ├─ App.tsx              # data loading, URL (?project=slug), theme
│  ├─ components/
│  │  ├─ MapView.tsx       # Leaflet map, clustered status-coloured pins, office marker
│  │  ├─ Sidebar.tsx       # search, filter chips, synced list
│  │  └─ ProjectDetails.tsx# full details panel
│  ├─ lib/format.ts        # price/status/BHK helpers
│  └─ styles.css           # light/dark themes, responsive layout
├─ public/data/projects.geo.json   # generated; loaded by the app
├─ data/
│  ├─ projects.json        # scraped projects (source of truth)
│  ├─ office.json          # office from /contact_us
│  ├─ location-overrides.json  # your manual pins (always win)
│  ├─ location-geocoded.json   # strict OSM matches from pins:osm --apply
│  ├─ manual-pin-todo.csv      # projects still to pin by hand (sorted by sector)
│  ├─ geocode-report.md / geocode-summary.md  # pins:osm report / geocoder summary
│  ├─ geocode-cache/       # Nominatim cache for pins:osm
│  ├─ landmarks-manual.json    # verified key landmarks + "major" hospitals
│  ├─ poi-exclude.json     # places removed after review (with reasons)
│  ├─ pois.json / nearby.json  # nearby places and per-project distances
│  ├─ osm-cache/ · route-cache.json  # Overpass and OSRM caches
│  ├─ geocode-cache.json   # Nominatim cache
│  ├─ scrape-report.md / geocode-report.md / verify-report.md
│  └─ raw/                 # saved HTML (git-ignored)
└─ tests/                  # parser tests on real saved pages
```

## Sharing a project

Append `?project=<slug>`, e.g. `/?project=trump-tower`. The map opens zoomed to
that project with its details panel open. The URL updates as you click around.

## Credits

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors.
Geocoding by [Nominatim](https://nominatim.org/) (usage policy: max 1 request/second).
Project data and images © White Collar Realty.
