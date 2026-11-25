import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import type { MappedProject, NearbyItem, Office, PoiCategory } from '../../shared/types.ts';
import { STATUS_COLORS, escapeHtml, formatInr, statusKey, ON_REQUEST } from '../lib/format.ts';
import { CATEGORY_META, CATEGORY_ORDER, type NearbyData } from '../lib/nearby.ts';
import NearbyLayer from './NearbyLayer.tsx';

const GURUGRAM_CENTER: L.LatLngTuple = [28.43, 77.04];

declare global {
  interface Window {
    __wcrStats?: { visible: number; pinned: number; unpinned: string[] };
  }
}

function pinIcon(color: string, approx: boolean) {
  return L.divIcon({
    className: 'pin-wrap',
    html: `<span class="pin${approx ? ' pin-approx' : ''}" style="--pin:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -10],
  });
}

const officeIcon = L.divIcon({
  className: 'pin-wrap',
  html: '<span class="office-pin" aria-hidden="true">WCR</span>',
  iconSize: [44, 28],
  iconAnchor: [22, 14],
  popupAnchor: [0, -12],
});

function popupHtml(p: MappedProject) {
  const price = p.priceText ?? formatInr(p.priceInr) ?? ON_REQUEST;
  const where = [p.sector, p.road].filter(Boolean).join(', ') || p.address || '';
  return `<div class="popup">
    <strong>${escapeHtml(p.name)}</strong>
    <div>${escapeHtml(where)}</div>
    <div class="popup-price">${escapeHtml(price)}</div>
    <div>${escapeHtml(p.configurationSummary ?? ON_REQUEST)}</div>
    ${p.locationAccuracy === 'sector-approx' ? '<div class="popup-approx">Approximate location (sector centre)</div>' : ''}
  </div>`;
}

function ClusterLayer({
  projects,
  office,
  selected,
  onSelect,
}: {
  projects: MappedProject[];
  office: Office | null;
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const markersRef = useRef(new Map<string, L.Marker>());
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const fittedRef = useRef(false);

  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      chunkedLoading: true,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // Rebuild markers when the filtered list changes.
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    markersRef.current.clear();
    const unpinned: string[] = [];
    const markers: L.Marker[] = [];
    for (const p of projects) {
      if (p.lat === null || p.lng === null) {
        unpinned.push(p.slug);
        continue;
      }
      const m = L.marker([p.lat, p.lng], {
        icon: pinIcon(STATUS_COLORS[statusKey(p.status)], p.locationAccuracy === 'sector-approx'),
        title: p.name,
        alt: p.name,
        keyboard: true,
        riseOnHover: true,
      });
      m.bindPopup(popupHtml(p), { closeButton: true, autoPan: true });
      m.on('click', () => onSelectRef.current(p.slug));
      m.on('keypress', (e: L.LeafletKeyboardEvent) => {
        if (e.originalEvent.key === 'Enter') onSelectRef.current(p.slug);
      });
      markersRef.current.set(p.slug, m);
      markers.push(m);
    }
    group.addLayers(markers);
    window.__wcrStats = { visible: projects.length, pinned: markers.length, unpinned };
    if (!fittedRef.current && markers.length) {
      fittedRef.current = true;
      if (!new URLSearchParams(location.search).get('project'))
        map.fitBounds(group.getBounds(), { padding: [30, 30], maxZoom: 13 });
    }
  }, [projects, map]);

  // Fade the other projects while one is selected.
  useEffect(() => {
    for (const [slug, m] of markersRef.current) m.setOpacity(selected && slug !== selected ? 0.35 : 1);
    map.getContainer().classList.toggle('has-selection', !!selected);
  }, [selected, projects, map]);

  // Fly to the selected project and open its popup.
  useEffect(() => {
    if (!selected) {
      map.closePopup();
      return;
    }
    const m = markersRef.current.get(selected);
    const group = groupRef.current;
    if (!m || !group) return;
    const target = m.getLatLng();
    map.flyTo(target, Math.max(map.getZoom(), 15), { duration: 0.8 });
    map.once('moveend', () => {
      group.zoomToShowLayer(m, () => m.openPopup());
    });
  }, [selected, projects, map]);

  // Company office: its own, unclustered marker.
  useEffect(() => {
    if (!office || office.lat === null || office.lng === null) return;
    const m = L.marker([office.lat, office.lng], {
      icon: officeIcon,
      title: `${office.name} office`,
      alt: `${office.name} office`,
      zIndexOffset: 1000,
      keyboard: true,
    }).bindPopup(
      `<div class="popup"><strong>${escapeHtml(office.name)} — Office</strong><div>${escapeHtml(office.address)}</div>${office.phones
        .map((ph) => `<div><a href="tel:${escapeHtml(ph.replace(/[^\d+]/g, ''))}">${escapeHtml(ph)}</a></div>`)
        .join('')}<div><a href="https://www.google.com/maps/dir/?api=1&destination=${office.lat},${office.lng}" target="_blank" rel="noopener">Directions</a></div></div>`,
    );
    m.addTo(map);
    return () => {
      m.remove();
    };
  }, [office, map]);

  return null;
}

function NearbyToggles({ value, onChange, disabled }: { value: PoiCategory[]; onChange: (v: PoiCategory[]) => void; disabled: boolean }) {
  return (
    <details className="nearby-toggles">
      <summary>
        Nearby places{value.length ? ` (${value.length})` : ''}
      </summary>
      <fieldset disabled={disabled}>
        <legend className="sr-only">Show nearby places across the city</legend>
        {CATEGORY_ORDER.map((c) => (
          <label key={c}>
            <input
              type="checkbox"
              checked={value.includes(c)}
              onChange={() => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c])}
            />
            <span className="poi-dot" style={{ background: CATEGORY_META[c].color }} aria-hidden="true">
              {CATEGORY_META[c].icon}
            </span>
            {CATEGORY_META[c].label}
          </label>
        ))}
        {value.length > 0 && (
          <button type="button" className="link-btn" onClick={() => onChange([])}>
            Hide all
          </button>
        )}
        {disabled && <p className="fine">Loading places…</p>}
      </fieldset>
    </details>
  );
}

export default function MapView(props: {
  projects: MappedProject[];
  office: Office | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  nearby: NearbyData | null;
  selectedProject: MappedProject | null;
  nearbyItems: NearbyItem[];
  cityCategories: PoiCategory[];
  onCityCategories: (v: PoiCategory[]) => void;
  highlight: string | null;
  onHighlight: (poiId: string | null) => void;
}) {
  const legend = useMemo(
    () =>
      (Object.keys(STATUS_COLORS) as (keyof typeof STATUS_COLORS)[]).filter((k) =>
        props.projects.some((p) => statusKey(p.status) === k),
      ),
    [props.projects],
  );
  return (
    <>
      <MapContainer center={GURUGRAM_CENTER} zoom={12} minZoom={9} className="map" zoomControl={true} preferCanvas={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <ClusterLayer projects={props.projects} office={props.office} selected={props.selected} onSelect={props.onSelect} />
        <NearbyLayer
          data={props.nearby}
          cityCategories={props.cityCategories}
          project={props.selectedProject}
          items={props.nearbyItems}
          highlight={props.highlight}
          onHighlight={props.onHighlight}
        />
      </MapContainer>
      <NearbyToggles value={props.cityCategories} onChange={props.onCityCategories} disabled={!props.nearby} />
      <details className="legend" open={typeof window !== 'undefined' && window.innerWidth > 820}>
        <summary>Legend</summary>
        <div className="legend-items">
          {legend.map((k) => (
            <span key={k}>
              <i style={{ background: STATUS_COLORS[k] }} />
              {k === 'On request' ? 'Status on request' : k}
            </span>
          ))}
          <span>
            <i className="legend-approx" />
            Approximate location (halo)
          </span>
          <span>
            <i className="legend-office">WCR</i>Office
          </span>
        </div>
      </details>
    </>
  );
}
