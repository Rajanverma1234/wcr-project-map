// Nearby places on the map:
//  • city-wide POI layer per category (off by default), clustered, and only the
//    POIs inside the visible area (+20 %) are rendered
//  • for the selected project: its nearby places, 3 km / 5 km rings, and a dashed
//    line to the highlighted place
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MappedProject, NearbyItem, Poi, PoiCategory } from '../../shared/types.ts';
import { escapeHtml } from '../lib/format.ts';
import { CATEGORY_META, directionsUrl, distanceText, haversineKm, type NearbyData } from '../lib/nearby.ts';

function poiIcon(cat: PoiCategory, emphasis: 'city' | 'nearby' | 'active') {
  const m = CATEGORY_META[cat];
  const size = emphasis === 'active' ? 34 : emphasis === 'nearby' ? 28 : 24;
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="poi-pin poi-${emphasis}" style="--poi:${m.color};width:${size}px;height:${size}px">${m.icon}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function popupHtml(poi: Pick<Poi, 'name' | 'category' | 'lat' | 'lng'>, project: MappedProject | null, item: NearbyItem | null) {
  const m = CATEGORY_META[poi.category];
  let dist = '';
  if (project && project.lat !== null && project.lng !== null) {
    const d = item ?? { straightKm: haversineKm({ lat: project.lat, lng: project.lng }, poi), driveKm: null, driveMin: null };
    const { text, isDrive } = distanceText(d);
    dist = `<div class="popup-dist">From ${escapeHtml(project.name)}: <strong>${escapeHtml(text)}</strong></div>
      ${isDrive ? '<div class="popup-fine">Approx, without traffic</div>' : ''}
      <div><a href="${directionsUrl({ lat: project.lat, lng: project.lng }, poi)}" target="_blank" rel="noopener">Directions</a></div>`;
  }
  return `<div class="popup"><strong>${escapeHtml(poi.name)}</strong><div class="popup-cat">${m.icon} ${escapeHtml(m.label)}</div>${dist}</div>`;
}

export default function NearbyLayer({
  data,
  cityCategories,
  project,
  items,
  highlight,
  onHighlight,
}: {
  data: NearbyData | null;
  cityCategories: PoiCategory[];
  project: MappedProject | null;
  items: NearbyItem[];
  highlight: string | null;
  onHighlight: (poiId: string | null) => void;
}) {
  const map = useMap();
  const cityRef = useRef<L.MarkerClusterGroup | null>(null);
  const selRef = useRef<L.LayerGroup | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const selMarkers = useRef(new Map<string, L.Marker>());
  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;
  const projectRef = useRef(project);
  projectRef.current = project;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Panes keep nearby markers above the project clusters.
  useEffect(() => {
    if (!map.getPane('nearby')) {
      const pane = map.createPane('nearby');
      pane.style.zIndex = '640';
    }
    const city = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      disableClusteringAtZoom: 16,
      chunkedLoading: true,
      iconCreateFunction: (c) =>
        L.divIcon({ html: `<span>${c.getChildCount()}</span>`, className: 'poi-cluster', iconSize: [28, 28] }),
    });
    const sel = L.layerGroup();
    map.addLayer(city);
    map.addLayer(sel);
    cityRef.current = city;
    selRef.current = sel;
    return () => {
      map.removeLayer(city);
      map.removeLayer(sel);
    };
  }, [map]);

  // City-wide layer: only enabled categories, only the visible area.
  useEffect(() => {
    const city = cityRef.current;
    if (!city || !data) return;
    const render = () => {
      city.clearLayers();
      if (!cityCategories.length) return;
      const bounds = map.getBounds().pad(0.2);
      const nearbyIds = new Set(itemsRef.current.map((i) => i.poiId));
      const markers: L.Marker[] = [];
      for (const p of data.pois) {
        if (!cityCategories.includes(p.category) || nearbyIds.has(p.id) || !bounds.contains([p.lat, p.lng])) continue;
        const mk = L.marker([p.lat, p.lng], { icon: poiIcon(p.category, 'city'), title: p.name, alt: p.name, keyboard: true });
        mk.bindPopup(() => popupHtml(p, projectRef.current, null));
        mk.on('click', () => drawLine(p));
        markers.push(mk);
      }
      city.addLayers(markers);
    };
    render();
    map.on('moveend', render);
    return () => {
      map.off('moveend', render);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, data, cityCategories, items]);

  function drawLine(to: { lat: number; lng: number }) {
    lineRef.current?.remove();
    lineRef.current = null;
    const p = projectRef.current;
    if (!p || p.lat === null || p.lng === null) return;
    lineRef.current = L.polyline(
      [
        [p.lat, p.lng],
        [to.lat, to.lng],
      ],
      { color: '#9a7440', weight: 3, dashArray: '6 8', opacity: 0.9, interactive: false },
    ).addTo(map);
  }

  // Selected project: rings + its nearby places.
  useEffect(() => {
    const sel = selRef.current;
    if (!sel) return;
    sel.clearLayers();
    selMarkers.current.clear();
    lineRef.current?.remove();
    lineRef.current = null;
    if (!project || project.lat === null || project.lng === null) return;
    const c: L.LatLngTuple = [project.lat, project.lng];
    for (const [r, label] of [
      [5000, '5 km'],
      [3000, '3 km'],
    ] as const) {
      L.circle(c, { radius: r, color: '#9a7440', weight: 1, opacity: 0.55, fillOpacity: 0.04, interactive: false, className: 'ring' }).addTo(sel);
      L.marker([project.lat + r / 111_320, project.lng], {
        icon: L.divIcon({ className: 'ring-label', html: label, iconSize: [36, 14], iconAnchor: [18, 7] }),
        interactive: false,
        keyboard: false,
      }).addTo(sel);
    }
    for (const it of items) {
      const mk = L.marker([it.lat, it.lng], {
        icon: poiIcon(it.category, 'nearby'),
        title: `${it.name} (${CATEGORY_META[it.category].label})`,
        alt: it.name,
        pane: 'nearby',
        keyboard: true,
      });
      mk.bindPopup(() => popupHtml(it, projectRef.current, it));
      mk.on('click', () => onHighlightRef.current(it.poiId));
      mk.on('popupclose', () => {
        lineRef.current?.remove();
        lineRef.current = null;
      });
      mk.addTo(sel);
      selMarkers.current.set(it.poiId, mk);
    }
  }, [project, items, map]);

  // Highlighted place: emphasise marker, dashed line, show both points.
  useEffect(() => {
    for (const [id, mk] of selMarkers.current) {
      const it = items.find((i) => i.poiId === id);
      if (it) mk.setIcon(poiIcon(it.category, id === highlight ? 'active' : 'nearby'));
    }
    if (!highlight || !project || project.lat === null || project.lng === null) return;
    const it = items.find((i) => i.poiId === highlight);
    if (!it) return;
    drawLine(it);
    const mk = selMarkers.current.get(highlight);
    map.flyToBounds(
      L.latLngBounds([
        [project.lat, project.lng],
        [it.lat, it.lng],
      ]),
      { padding: [70, 70], maxZoom: 16, duration: 0.6 },
    );
    map.once('moveend', () => mk?.openPopup());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, items, project, map]);

  return null;
}
