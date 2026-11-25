import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MapData, MappedProject, NearbyItem, PoiCategory } from '../shared/types.ts';
import { decodeNearby, type NearbyData } from './lib/nearby.ts';
import MapView from './components/MapView.tsx';
import Sidebar, { type Filters, EMPTY_FILTERS, applyFilters } from './components/Sidebar.tsx';
import ProjectDetails from './components/ProjectDetails.tsx';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('wcr-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<string | null>(() => new URLSearchParams(location.search).get('project'));
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [nearby, setNearby] = useState<NearbyData | null>(null);
  const [nearbyError, setNearbyError] = useState(false);
  const [cityCategories, setCityCategories] = useState<PoiCategory[]>([]); // off by default
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/projects.geo.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not load project data (HTTP ${r.status})`);
        return r.json() as Promise<MapData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
    // Nearby data is optional: the map works without it.
    fetch(`${import.meta.env.BASE_URL}data/nearby.geo.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((raw) => setNearby(decodeNearby(raw)))
      .catch(() => setNearbyError(true));
  }, []);

  // A new selection starts without a highlighted place.
  useEffect(() => setHighlight(null), [selected]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('wcr-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const active = useMemo(() => (data?.projects ?? []).filter((p) => p.active), [data]);
  const visible = useMemo(() => applyFilters(active, filters), [active, filters]);
  const selectedProject: MappedProject | null = useMemo(
    () => active.find((p) => p.slug === selected) ?? null,
    [active, selected],
  );

  // Shareable URL: ?project=<slug>
  useEffect(() => {
    const url = new URL(location.href);
    if (selected) url.searchParams.set('project', selected);
    else url.searchParams.delete('project');
    history.replaceState(null, '', url);
  }, [selected]);

  // Unknown slug in the URL (e.g. a removed project): drop it once data is loaded.
  useEffect(() => {
    if (data && selected && !selectedProject) setSelected(null);
  }, [data, selected, selectedProject]);

  const select = useCallback((slug: string | null) => setSelected(slug), []);
  const nearbyView = selectedProject ? nearby?.byProject.get(selectedProject.slug) : undefined;
  const majorHospital = nearbyView?.majorHospital ?? null;
  // Map markers: the nearest places per category plus the nearest major hospital.
  const nearbyItems: NearbyItem[] = useMemo(() => {
    const xs = nearbyView?.items ?? [];
    return majorHospital && !xs.some((x) => x.poiId === majorHospital.poiId) ? [...xs, majorHospital] : xs;
  }, [nearbyView, majorHospital]);

  if (error) return <div className="state-msg" role="alert">{error}</div>;
  if (!data) return <div className="state-msg" aria-busy="true">Loading projects…</div>;

  return (
    <div className={`app ${selectedProject ? 'has-details' : ''}`}>
      <Sidebar
        projects={active}
        visible={visible}
        filters={filters}
        onFilters={setFilters}
        selected={selected}
        onSelect={select}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        generatedAt={data.generatedAt}
      />
      <main className="map-area" aria-label="Map of projects">
        <MapView
          projects={visible}
          office={data.office}
          selected={selected}
          onSelect={select}
          nearby={nearby}
          selectedProject={selectedProject}
          nearbyItems={nearbyItems}
          cityCategories={cityCategories}
          onCityCategories={setCityCategories}
          highlight={highlight}
          onHighlight={setHighlight}
        />
        {selectedProject && (
          <ProjectDetails
            project={selectedProject}
            office={data.office}
            onClose={() => select(null)}
            nearbyItems={nearbyView?.items ?? []}
            majorHospital={majorHospital}
            nearbyStatus={nearby ? 'ready' : nearbyError ? 'error' : 'loading'}
            highlight={highlight}
            onHighlight={setHighlight}
          />
        )}
      </main>
    </div>
  );
}
