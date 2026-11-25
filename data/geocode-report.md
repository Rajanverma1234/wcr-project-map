# OSM pin matching report (`npm run pins:osm`)

- Run: 2026-11-25T08:28:36.619Z — mode **dry run (no pins changed)**
- Projects: 151
- **matched 15** · ambiguous 19 · unmatched 116 · skipped (override) 1
- Nominatim live requests 0, cache hits 421 · Overpass live 0, cache 3
- Sector check used: polygon 100, radius 40, none 10
- Matched accuracy: exact 14, geocoded 1
- data/location-overrides.json: unchanged ✅

## Matched (15)

| Project | Sector | OSM object | New pin | Moved from sector centre | Score | Accuracy | Sector check |
|---|---|---|---|---|---|---|---|
| AIPL - JOY CENTRAL GURGAON | Sector 65 | [way/1551937596](https://www.openstreetmap.org/way/1551937596) "AIPL Joy Central" (shop=mall, building=yes) | [28.40514, 77.06066](https://www.google.com/maps/search/?api=1&query=28.405141,77.060656) | 905 m | 1.00 | exact | polygon |
| Ambience - Creacions | Sector 22 | [way/189119728](https://www.openstreetmap.org/way/189119728) "Ambience Creacions" (landuse=residential) | [28.50518, 77.06723](https://www.google.com/maps/search/?api=1&query=28.505175,77.067229) | 210 m | 1.00 | exact | polygon |
| Ambience Caitriona | Sector 24 | [node/2724843419](https://www.openstreetmap.org/node/2724843419) "Caitriona" (landuse=residential) | [28.50282, 77.10033](https://www.google.com/maps/search/?api=1&query=28.502823,77.100327) | 932 m | 1.00 | geocoded | polygon |
| DLF - CORPORATE GREENS | Sector 74A | [way/269878358](https://www.openstreetmap.org/way/269878358) "Corporate Greens" (landuse=commercial) | [28.40637, 76.99985](https://www.google.com/maps/search/?api=1&query=28.406366,76.999851) | 504 m | 1.00 | exact | polygon |
| DLF - ULTIMA | Sector 81 | [relation/3755469](https://www.openstreetmap.org/relation/3755469) "The Ultima" (landuse=residential) | [28.38926, 76.95152](https://www.google.com/maps/search/?api=1&query=28.389256,76.951518) | 439 m | 1.00 | exact | polygon |
| DLF Magnolias | Sector 42 | [relation/3737034](https://www.openstreetmap.org/relation/3737034) "The Magnolias" (landuse=residential) | [28.45633, 77.10012](https://www.google.com/maps/search/?api=1&query=28.456329,77.100116) | 819 m | 1.00 | exact | polygon |
| DLF- SUMMIT PLAZA | Sector 54 | [way/1223763808](https://www.openstreetmap.org/way/1223763808) "Summit Plaza" (landuse=construction) | [28.44606, 77.10598](https://www.google.com/maps/search/?api=1&query=28.446064,77.105981) | 679 m | 1.00 | exact | polygon |
| Emaar Business Square | Sector 65 | [way/273714322](https://www.openstreetmap.org/way/273714322) "Business Square" (landuse=commercial) | [28.40852, 77.06826](https://www.google.com/maps/search/?api=1&query=28.408518,77.068256) | 626 m | 1.00 | exact | polygon |
| Godrej Astra | Sector 54 | [way/1374374907](https://www.openstreetmap.org/way/1374374907) "Godrej Astra" (landuse=construction) | [28.43284, 77.10595](https://www.google.com/maps/search/?api=1&query=28.432844,77.105946) | 1.15 km | 1.00 | exact | polygon |
| Godrej Samaris | Sector 53 | [way/1441600442](https://www.openstreetmap.org/way/1441600442) "Godrej Samaris" (landuse=construction) | [28.43512, 77.10001](https://www.google.com/maps/search/?api=1&query=28.435116,77.100012) | 778 m | 1.00 | exact | polygon |
| M3M - Golf Estate | Sector 65 | [relation/3646897](https://www.openstreetmap.org/relation/3646897) "M3M Golf Estate" (place=neighbourhood) | [28.40114, 77.06641](https://www.google.com/maps/search/?api=1&query=28.401144,77.066413) | 374 m | 1.00 | exact | polygon |
| M3M - POLO SUITES | Sector 65 | [way/349814051](https://www.openstreetmap.org/way/349814051) "M3M Polo Suites" (building=yes) | [28.40193, 77.07234](https://www.google.com/maps/search/?api=1&query=28.401925,77.072335) | 295 m | 1.00 | exact | polygon |
| M3M Corner Walk | Sector 74 | [way/1409467512](https://www.openstreetmap.org/way/1409467512) "M3M Corner Walk" (landuse=commercial) | [28.40224, 77.00838](https://www.google.com/maps/search/?api=1&query=28.402241,77.008379) | 990 m | 1.00 | exact | polygon |
| M3M IFC | Sector 66 | [way/1247281578](https://www.openstreetmap.org/way/1247281578) "M3M IFC" (landuse=commercial) | [28.40491, 77.05843](https://www.google.com/maps/search/?api=1&query=28.404912,77.058426) | 943 m | 1.00 | exact | polygon |
| SATYA - ELEMENT ONE | Sector 47 & 49 | [way/282848371](https://www.openstreetmap.org/way/282848371) "Element One" (landuse=retail) | [28.42050, 77.05011](https://www.google.com/maps/search/?api=1&query=28.420505,77.050111) | 576 m | 1.00 | exact | polygon |

## Ambiguous (19)

| Project | Sector | Candidate | Score | From sector centre | Inside sector | OSM | Why not accepted |
|---|---|---|---|---|---|---|---|
| Central Park - Sky Villas | Sector 48 | "The Villas" (landuse=residential) | 1.00 | 2.45 km | no | [relation/3653341](https://www.openstreetmap.org/relation/3653341) | distinctive word missing; outside sector (radius) |
| DLF Hamilton Court 2 | Sector 28 | "DLF Hamilton Court" (landuse=residential) | 1.00 | 719 m | no | [way/40122706](https://www.openstreetmap.org/way/40122706) | distinctive word missing; outside sector (polygon) |
| DLF Magnolias 2 | Sector 28 | "The Magnolias" (landuse=residential) | 1.00 | 2.62 km | no | [relation/3737034](https://www.openstreetmap.org/relation/3737034) | distinctive word missing; outside sector (polygon); > 2.5 km from centre |
| DLF Sector 63 Gurgaon | Sector 63 | "DLF Downtown Gurugram" (landuse=commercial) | 1.00 | 11.93 km | no | [way/1234311689](https://www.openstreetmap.org/way/1234311689) | distinctive word missing; outside sector (radius); > 2.5 km from centre |
| ELAN - PARADISE | Sector 50 | "Paradise Mall" (building=retail) | 0.77 | 1.15 km | no | [way/1465783071](https://www.openstreetmap.org/way/1465783071) | score < 0.9; outside sector (polygon) |
| EMAAR - MARBELLA VILLAS | Sector 66 | "Marbella" (landuse=residential) | 1.00 | 475 m | yes | [relation/3646898](https://www.openstreetmap.org/relation/3646898) | distinctive word missing |
| Experion Windchants Nova | Sector 112 | "Windchants" (landuse=residential) | 1.00 | 421 m | yes | [way/268643947](https://www.openstreetmap.org/way/268643947) | distinctive word missing |
| EXPERION WINDCHANTS VILLA | Sector 112 | "Windchants" (landuse=residential) | 1.00 | 421 m | yes | [way/268643947](https://www.openstreetmap.org/way/268643947) | distinctive word missing |
| KRRISH - PROVENCE | – | "Krrish Provence Estate" (landuse=residential) | 1.00 | – | no | [way/1366740994](https://www.openstreetmap.org/way/1366740994) | outside sector (no check); > 2.5 km from centre |
| M3M Golf Estate 2 | Sector 79 | "M3M Golf Estate" (place=neighbourhood) | 1.00 | – | no | [relation/3646897](https://www.openstreetmap.org/relation/3646897) | distinctive word missing; outside sector (no check); > 2.5 km from centre |
| PURI - DIPLOMATIC GREENS | Sector 110 | "Diplomatica Greens" (landuse=residential) | 0.85 | 1.71 km | no | [way/268643944](https://www.openstreetmap.org/way/268643944) | distinctive word missing; score < 0.9; outside sector (polygon) |
| PURI - DIPLOMATIC GREENS VILLAS | Sector 110 | "Diplomatica Greens" (landuse=residential) | 0.77 | 1.71 km | no | [way/268643944](https://www.openstreetmap.org/way/268643944) | distinctive word missing; score < 0.9; outside sector (polygon) |
| Sobha International City- Villa | Sector 109 | "International City" (landuse=residential) | 1.00 | 1.13 km | no | [relation/3643709](https://www.openstreetmap.org/relation/3643709) | distinctive word missing; outside sector (polygon) |
|  |  | "International City" (landuse=residential) | 1.00 | 536 m | yes | [relation/3643710](https://www.openstreetmap.org/relation/3643710) | distinctive word missing |
| SS Group - The Hibiscus Penthouse | Sector 50 | "Hibiscus" (landuse=residential) | 1.00 | 762 m | yes | [relation/3755083](https://www.openstreetmap.org/relation/3755083) | distinctive word missing |
| SS Group - The Hibiscus Villa | Sector 50 | "Hibiscus" (landuse=residential) | 1.00 | 762 m | yes | [relation/3755083](https://www.openstreetmap.org/relation/3755083) | distinctive word missing |
| Suncity Platinum Tower | Sector 28 | "Platinum Tower" (landuse=commercial) | 1.00 | 7.18 km | no | [way/269672384](https://www.openstreetmap.org/way/269672384) | outside sector (polygon); > 2.5 km from centre |
| TATA PRIMANTI - EXECUTIVE FLOOR | Sector 72 | "Primanti" (landuse=residential) | 1.00 | 1.42 km | yes | [relation/3730389](https://www.openstreetmap.org/relation/3730389) | distinctive word missing |
|  |  | "Primanti Club" (building=yes) | 0.76 | 1.49 km | yes | [way/1122409779](https://www.openstreetmap.org/way/1122409779) | distinctive word missing; score < 0.9 |
| TATA PRIMANTI - VERTILLA VILLA | Sector 72 | "Primanti" (landuse=residential) | 1.00 | 1.42 km | yes | [relation/3730389](https://www.openstreetmap.org/relation/3730389) | distinctive word missing |
|  |  | "Primanti Club" (building=yes) | 0.76 | 1.49 km | yes | [way/1122409779](https://www.openstreetmap.org/way/1122409779) | distinctive word missing; score < 0.9 |
| Trump Towers 2 | Sector 69 | "Tower 2" (building=apartments) | 1.00 | 1.12 km | no | [way/354449440](https://www.openstreetmap.org/way/354449440) | outside sector (polygon) |

## Unmatched (116)

| Project | Sector | Pin it by hand |
|---|---|---|
| Adani Ivana | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Adani%20Ivana%20Sector%2063%20Gurugram) |
| Adani Lushlands | Sector 2 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Adani%20Lushlands%20Sector%202%20Gurugram) |
| Adani Samsara Vilasa | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Adani%20Samsara%20Vilasa%20Sector%2063%20Gurugram) |
| Adani The Marq | Sector 102 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Adani%20The%20Marq%20Sector%20102%20Gurugram) |
| AIPL JOY Gallery | Sector 66 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=AIPL%20JOY%20Gallery%20Sector%2066%20Gurugram) |
| Aipl The Riviera | Sector 103 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Aipl%20The%20Riviera%20Sector%20103%20Gurugram) |
| AIPL- JOY SQUARE | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=AIPL-%20JOY%20SQUARE%20Sector%2063A%20Gurugram) |
| Anant Raj Sector 63A | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Anant%20Raj%20Sector%2063A%20Sector%2063A%20Gurugram) |
| Anant Raj The Estate One | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Anant%20Raj%20The%20Estate%20One%20Sector%2063A%20Gurugram) |
| Anantraj Estate- Luxury Estate Villas | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Anantraj%20Estate-%20Luxury%20Estate%20Villas%20Sector%2063%20Gurugram) |
| AnantRaj The Estate Residences | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=AnantRaj%20The%20Estate%20Residences%20Sector%2063A%20Gurugram) |
| Antara Senior Living by Max Estates | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Antara%20Senior%20Living%20by%20Max%20Estates%20Sector%2063A%20Gurugram) |
| BESTECH - CENTRAL BOULEVARD | Sector 88 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=BESTECH%20-%20CENTRAL%20BOULEVARD%20Sector%2088%20Gurugram) |
| BESTECH- SKY SUITES | Sector 81 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=BESTECH-%20SKY%20SUITES%20Sector%2081%20Gurugram) |
| Birla Pravaah | Sector 71 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Birla%20Pravaah%20Sector%2071%20Gurugram) |
| BPTP Downtown 66 | Sector 66 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=BPTP%20Downtown%2066%20Sector%2066%20Gurugram) |
| BPTP Gaia Residences | Sector 102 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=BPTP%20Gaia%20Residences%20Sector%20102%20Gurugram) |
| CENTRAL PARK - BELLAVISTA TOWERS | Sector 48 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=CENTRAL%20PARK%20-%20BELLAVISTA%20TOWERS%20Sector%2048%20Gurugram) |
| CENTRAL PARK - FLEUR VILLAS | Sector 33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=CENTRAL%20PARK%20-%20FLEUR%20VILLAS%20Sector%2033%20Gurugram) |
| CENTRAL PARK - MIKASA PLOTS | Sector 33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=CENTRAL%20PARK%20-%20MIKASA%20PLOTS%20Sector%2033%20Gurugram) |
| Central Park Belanova | Sector 48 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Belanova%20Sector%2048%20Gurugram) |
| Central Park Delphine | Sector 104 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Delphine%20Sector%20104%20Gurugram) |
| Central Park Flower Valley | Sector 32-33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Flower%20Valley%20Sector%2032-33%20Gurugram) |
| Central Park Flower Valley Villas | Sector 32-33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Flower%20Valley%20Villas%20Sector%2032-33%20Gurugram) |
| Central Park Resorts | Sector 48 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Resorts%20Sector%2048%20Gurugram) |
| Central Park Resorts Apporva | Sector 48 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Resorts%20Apporva%20Sector%2048%20Gurugram) |
| Central Park Villas Mira Vita | Sohna, Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Central%20Park%20Villas%20Mira%20Vita%20Gurugram) |
| CENTRAL PARK- CERISE SUITES | Sector 33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=CENTRAL%20PARK-%20CERISE%20SUITES%20Sector%2033%20Gurugram) |
| Cocoa County by County Group | Sector 88A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Cocoa%20County%20by%20County%20Group%20Sector%2088A%20Gurugram) |
| Conscient Hines Elevate 3.0 | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Conscient%20Hines%20Elevate%203.0%20Sector%2063A%20Gurugram) |
| Conscient Hines- Elevate | Sector 59 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Conscient%20Hines-%20Elevate%20Sector%2059%20Gurugram) |
| DLF Arbour 2 | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20Arbour%202%20Sector%2063%20Gurugram) |
| DLF Senior Living | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20Senior%20Living%20Sector%2063%20Gurugram) |
| DLF The Arbour | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20The%20Arbour%20Sector%2063%20Gurugram) |
| DLF The Aureva | Sector 63 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20The%20Aureva%20Sector%2063%20Gurugram) |
| DLF The Camellias | Sector 42 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20The%20Camellias%20Sector%2042%20Gurugram) |
| DLF The Crest | Sector 54 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=DLF%20The%20Crest%20Sector%2054%20Gurugram) |
| Elan Empire | Sector 66 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Elan%20Empire%20Sector%2066%20Gurugram) |
| Elan Epic | Sector 70 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Elan%20Epic%20Sector%2070%20Gurugram) |
| ELAN MIRACLE | Sector 84 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=ELAN%20MIRACLE%20Sector%2084%20Gurugram) |
| Elan The Mark | Sector 106 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Elan%20The%20Mark%20Sector%20106%20Gurugram) |
| Elan The Presidential | Sector 106 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Elan%20The%20Presidential%20Sector%20106%20Gurugram) |
| Elan The Statement | Sector 49 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Elan%20The%20Statement%20Sector%2049%20Gurugram) |
| ELAN TOWN CENTRE | Sector 67 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=ELAN%20TOWN%20CENTRE%20Sector%2067%20Gurugram) |
| Emaar - DigiHomes | Sector 62 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Emaar%20-%20DigiHomes%20Sector%2062%20Gurugram) |
| EMAAR - EBD 114 | Sector 114 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=EMAAR%20-%20EBD%20114%20Sector%20114%20Gurugram) |
| Emaar Amaris | Sector 62 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Emaar%20Amaris%20Sector%2062%20Gurugram) |
| Emaar Digi Homes Phase 2 | Sector 62 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Emaar%20Digi%20Homes%20Phase%202%20Sector%2062%20Gurugram) |
| Emaar EBD 65 | Sector 65 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Emaar%20EBD%2065%20Sector%2065%20Gurugram) |
| Emaar Serenity Hills | Sector 86 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Emaar%20Serenity%20Hills%20Sector%2086%20Gurugram) |
| Experion Emerelle Reserve | Sector 88A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Experion%20Emerelle%20Reserve%20Sector%2088A%20Gurugram) |
| Experion One42 | Sector 42 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Experion%20One42%20Sector%2042%20Gurugram) |
| Experion The Trillion | Sector 48 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Experion%20The%20Trillion%20Sector%2048%20Gurugram) |
| Ganga Nandaka | Sector 84 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Ganga%20Nandaka%20Sector%2084%20Gurugram) |
| Godrej Alira Sector 39 | Sector 39 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Godrej%20Alira%20Sector%2039%20Sector%2039%20Gurugram) |
| Godrej Miraya | Sector 43 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Godrej%20Miraya%20Sector%2043%20Gurugram) |
| Godrej Sora | Sector 53 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Godrej%20Sora%20Sector%2053%20Gurugram) |
| Godrej Verano | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Godrej%20Verano%20Sector%2063A%20Gurugram) |
| GRAND HYATT RESIDENCES | Sector 58 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=GRAND%20HYATT%20RESIDENCES%20Sector%2058%20Gurugram) |
| Ireo Corridor Sector 67A | Sector 67A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Ireo%20Corridor%20Sector%2067A%20Sector%2067A%20Gurugram) |
| Krisumi Waterfall Residences | Sector 36A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Krisumi%20Waterfall%20Residences%20Sector%2036A%20Gurugram) |
| M3M - Prive 73 | Sector 73 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20-%20Prive%2073%20Sector%2073%20Gurugram) |
| M3M - ST. ANDREWS | Sector 65 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20-%20ST.%20ANDREWS%20Sector%2065%20Gurugram) |
| M3M 65th Avenue | Sector 66 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%2065th%20Avenue%20Sector%2066%20Gurugram) |
| M3M Altitude | Sector 65 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Altitude%20Sector%2065%20Gurugram) |
| M3M Brabus | Sector 58 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Brabus%20Sector%2058%20Gurugram) |
| M3M Broadway | Sector 71 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Broadway%20Sector%2071%20Gurugram) |
| M3M Elie Saab | Sector 111 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Elie%20Saab%20Sector%20111%20Gurugram) |
| M3M Forestia West | Manesar, Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Forestia%20West%20Gurugram) |
| M3M GIC | Manesar, Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20GIC%20Gurugram) |
| M3M Jacob & Co Residences Sector 111 | Sector 111 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Jacob%20%26%20Co%20Residences%20Sector%20111%20Sector%20111%20Gurugram) |
| M3M Opus | Sector 67 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20Opus%20Sector%2067%20Gurugram) |
| M3M SCO 113 | Sector 113 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20SCO%20113%20Sector%20113%20Gurugram) |
| M3M St. Andrews at SCDA | Sector 113 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M%20St.%20Andrews%20at%20SCDA%20Sector%20113%20Gurugram) |
| M3M- LATITUDE | Sector 65 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=M3M-%20LATITUDE%20Sector%2065%20Gurugram) |
| Mahindra Luminare | Sector 59 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Mahindra%20Luminare%20Sector%2059%20Gurugram) |
| Max Estate 360 | Sector 36A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Max%20Estate%20360%20Sector%2036A%20Gurugram) |
| Max Estate 361 | Sector 36A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Max%20Estate%20361%20Sector%2036A%20Gurugram) |
| MVN Aero One | Sector 37D | [Google Maps search](https://www.google.com/maps/search/?api=1&query=MVN%20Aero%20One%20Sector%2037D%20Gurugram) |
| Oberoi 360 North | Sector 58 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Oberoi%20360%20North%20Sector%2058%20Gurugram) |
| Omara by Trehan IRIS | Sector 80 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Omara%20by%20Trehan%20IRIS%20Sector%2080%20Gurugram) |
| Orchid IVY Floors | Sector 51 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Orchid%20IVY%20Floors%20Sector%2051%20Gurugram) |
| Paras Florett | Sector 59 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Paras%20Florett%20Sector%2059%20Gurugram) |
| Paras Manor | Gwal Pahari, Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Paras%20Manor%20Gurugram) |
| Paras Quartier | Gwal Pahari , Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Paras%20Quartier%20Gurugram) |
| Pioneer - Araya | Sector 62 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Pioneer%20-%20Araya%20Sector%2062%20Gurugram) |
| Puri Aravallis | Sector 61 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Puri%20Aravallis%20Sector%2061%20Gurugram) |
| Puri Diplomatic Residences | Sector 111 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Puri%20Diplomatic%20Residences%20Sector%20111%20Gurugram) |
| Shapoorji Pallonji The Dualis Gurgaon | Sector 46 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Shapoorji%20Pallonji%20The%20Dualis%20Gurgaon%20Sector%2046%20Gurugram) |
| Signature Global Cloverdale SPR | Sector 71 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Signature%20Global%20Cloverdale%20SPR%20Sector%2071%20Gurugram) |
| Signature Global DXP Estate | Sector 37 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Signature%20Global%20DXP%20Estate%20Sector%2037%20Gurugram) |
| Signature Global Titanium | Sector 71 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Signature%20Global%20Titanium%20Sector%2071%20Gurugram) |
| Silverglades Hightown Residences | Sector 28 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Silverglades%20Hightown%20Residences%20Sector%2028%20Gurugram) |
| Silverglades Legacy | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Silverglades%20Legacy%20Sector%2063A%20Gurugram) |
| Skylo by Central Park | Sector 33 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Skylo%20by%20Central%20Park%20Sector%2033%20Gurugram) |
| Smartworld GIC Lofts | Manesar, Gurgaon | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Smartworld%20GIC%20Lofts%20Gurugram) |
| Smartworld One Dxp | Sector 113 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Smartworld%20One%20Dxp%20Sector%20113%20Gurugram) |
| Smartworld The Edition | Sector 66 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Smartworld%20The%20Edition%20Sector%2066%20Gurugram) |
| Smartworld Wellness 67 | Sector 67A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Smartworld%20Wellness%2067%20Sector%2067A%20Gurugram) |
| Sobha Aranya | Sector 80 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Sobha%20Aranya%20Sector%2080%20Gurugram) |
| Sobha Crescent | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Sobha%20Crescent%20Sector%2063A%20Gurugram) |
| Sobha Strada | Sector 106 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Sobha%20Strada%20Sector%20106%20Gurugram) |
| Tarc Ishva | Sector 63A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Tarc%20Ishva%20Sector%2063A%20Gurugram) |
| The Bungalows by Max Estates | Sector 59 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=The%20Bungalows%20by%20Max%20Estates%20Sector%2059%20Gurugram) |
| The Falcon by Dalcore | Sector 53 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=The%20Falcon%20by%20Dalcore%20Sector%2053%20Gurugram) |
| The Terraces by Max Estates | Sector 36A | [Google Maps search](https://www.google.com/maps/search/?api=1&query=The%20Terraces%20by%20Max%20Estates%20Sector%2036A%20Gurugram) |
| Tonino Lamborghini Residences by Signature Global | Sector 71 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Tonino%20Lamborghini%20Residences%20by%20Signature%20Global%20Sector%2071%20Gurugram) |
| Trevoc Royal Residences | Sector 56 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Trevoc%20Royal%20Residences%20Sector%2056%20Gurugram) |
| Trump Residences Gurgaon | Sector 69 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Trump%20Residences%20Gurgaon%20Sector%2069%20Gurugram) |
| Trump Tower | Sector 65 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Trump%20Tower%20Sector%2065%20Gurugram) |
| Tulip Crimson | Sector 70 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Tulip%20Crimson%20Sector%2070%20Gurugram) |
| Tulip Monsella | Sector 53 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Tulip%20Monsella%20Sector%2053%20Gurugram) |
| VIPUL - AAROHAN | Sector 53 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=VIPUL%20-%20AAROHAN%20Sector%2053%20Gurugram) |
| Whiteland Sector 103 | Sector 103 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Whiteland%20Sector%20103%20Sector%20103%20Gurugram) |
| Whiteland The Aspen | Sector 76 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Whiteland%20The%20Aspen%20Sector%2076%20Gurugram) |
| Whiteland Westin Residences | Sector 103 | [Google Maps search](https://www.google.com/maps/search/?api=1&query=Whiteland%20Westin%20Residences%20Sector%20103%20Gurugram) |

## Override disagrees (0)

OSM has a confident match more than 300 m from the manual override. Nothing was changed. Please double-check.

None.
- 32nd AVENUE MILESTONE: override kept (no confident OSM match to compare)

## Hospital candidates for manual verification

W Pratiksha / Marengo Asia Hospital: OSM was searched; **no coordinates were added**. The entry in data/landmarks-manual.json stays empty until a verified pin is supplied.

No OSM object found for: "W Pratiksha Hospital, Gurugram", "Marengo Asia Hospital, Gurugram", "Pratiksha Hospital, Gurugram", nor any name containing "Pratiksha" or "Marengo" in the hospital and named-places data.
