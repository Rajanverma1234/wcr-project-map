import { useEffect, useMemo, useRef } from 'react';
import type { MappedProject } from '../../shared/types.ts';
import {
  PRICE_BUCKETS,
  STATUS_COLORS,
  STATUS_ORDER,
  bhksOf,
  formatInr,
  kindOf,
  priceBucketOf,
  statusKey,
  ON_REQUEST,
  type Kind,
  type PriceBucketId,
  type StatusKey,
} from '../lib/format.ts';

export interface Filters {
  q: string;
  corridors: string[];
  kinds: Kind[];
  statuses: StatusKey[];
  bhks: number[];
  prices: PriceBucketId[];
}
export const EMPTY_FILTERS: Filters = { q: '', corridors: [], kinds: [], statuses: [], bhks: [], prices: [] };

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ');

export function applyFilters(projects: MappedProject[], f: Filters): MappedProject[] {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  return projects.filter((p) => {
    if (words.length) {
      const hay = norm([p.name, p.developer, p.sector, p.road, p.address, p.corridor].filter(Boolean).join(' '));
      // "sector 65" / "65" should match "Sector 65" exactly, not "Sector 65A" partially elsewhere
      if (!words.every((w) => hay.includes(w))) return false;
    }
    if (f.corridors.length && !(p.corridor && f.corridors.includes(p.corridor))) return false;
    if (f.kinds.length && !f.kinds.includes(kindOf(p))) return false;
    if (f.statuses.length && !f.statuses.includes(statusKey(p.status))) return false;
    if (f.bhks.length) {
      const b = bhksOf(p);
      if (!f.bhks.some((x) => b.includes(x))) return false;
    }
    if (f.prices.length && !f.prices.includes(priceBucketOf(p))) return false;
    return true;
  });
}

function toggle<T>(xs: T[], x: T): T[] {
  return xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x];
}

function ChipGroup<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  render = (o) => String(o),
}: {
  legend: string;
  options: { v: T; n: number }[];
  value: T[];
  onChange: (v: T[]) => void;
  render?: (o: T) => string;
}) {
  if (!options.length) return null;
  return (
    <fieldset className="chips">
      <legend>{legend}</legend>
      <div className="chip-row">
        {options.map(({ v, n }) => (
          <button
            key={String(v)}
            type="button"
            className="chip"
            aria-pressed={value.includes(v)}
            onClick={() => onChange(toggle(value, v))}
          >
            {render(v)} <span className="chip-n">{n}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function countBy<T>(projects: MappedProject[], key: (p: MappedProject) => T | T[] | null): { v: T; n: number }[] {
  const m = new Map<T, number>();
  for (const p of projects) {
    const k = key(p);
    for (const x of Array.isArray(k) ? k : k === null ? [] : [k]) m.set(x, (m.get(x) ?? 0) + 1);
  }
  return [...m.entries()].map(([v, n]) => ({ v, n }));
}

export default function Sidebar(props: {
  projects: MappedProject[];
  visible: MappedProject[];
  filters: Filters;
  onFilters: (f: Filters) => void;
  selected: string | null;
  onSelect: (slug: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  generatedAt: string;
}) {
  const { projects, visible, filters: f, onFilters } = props;
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onFilters({ ...f, [k]: v });

  const corridors = useMemo(
    () => countBy(projects, (p) => p.corridor).sort((a, b) => b.n - a.n || String(a.v).localeCompare(String(b.v))),
    [projects],
  );
  const kinds = useMemo(() => countBy(projects, kindOf).sort((a, b) => b.n - a.n), [projects]);
  const statuses = useMemo(
    () => countBy(projects, (p) => statusKey(p.status)).sort((a, b) => STATUS_ORDER.indexOf(a.v) - STATUS_ORDER.indexOf(b.v)),
    [projects],
  );
  const bhks = useMemo(() => countBy(projects, bhksOf).sort((a, b) => a.v - b.v), [projects]);
  const prices = useMemo(() => {
    const c = countBy(projects, priceBucketOf);
    return PRICE_BUCKETS.map((b) => ({ v: b.id as PriceBucketId, n: c.find((x) => x.v === b.id)?.n ?? 0 })).filter((x) => x.n);
  }, [projects]);

  const sorted = useMemo(() => [...visible].sort((a, b) => a.name.localeCompare(b.name)), [visible]);
  const active = Object.values(f).some((v) => (Array.isArray(v) ? v.length : v));

  // Keep the selected item in view in the list.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!props.selected) return;
    listRef.current?.querySelector(`[data-slug="${CSS.escape(props.selected)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [props.selected]);

  return (
    <aside className="sidebar" aria-label="Search and filter projects">
      <header className="side-head">
        <div>
          <h1>Gurugram Projects</h1>
          <p className="muted">White Collar Realty · {projects.length} projects</p>
        </div>
        <button type="button" className="icon-btn" onClick={props.onToggleTheme} aria-label={`Switch to ${props.theme === 'dark' ? 'light' : 'dark'} mode`}>
          {props.theme === 'dark' ? '☀' : '☾'}
        </button>
      </header>

      <div className="filters">
        <label className="search">
          <span className="sr-only">Search by project, developer or sector</span>
          <input
            type="search"
            placeholder="Search project, developer, sector…"
            value={f.q}
            onChange={(e) => set('q', e.target.value)}
          />
        </label>
        <ChipGroup legend="Road / corridor" options={corridors as { v: string; n: number }[]} value={f.corridors} onChange={(v) => set('corridors', v)} />
        <ChipGroup legend="Type" options={kinds} value={f.kinds} onChange={(v) => set('kinds', v)} />
        <ChipGroup
          legend="Status"
          options={statuses}
          value={f.statuses}
          onChange={(v) => set('statuses', v)}
          render={(s) => (s === 'On request' ? 'Status on request' : s)}
        />
        <ChipGroup legend="BHK" options={bhks} value={f.bhks} onChange={(v) => set('bhks', v)} render={(n) => `${n} BHK`} />
        <ChipGroup
          legend="Starting price"
          options={prices}
          value={f.prices}
          onChange={(v) => set('prices', v)}
          render={(id) => PRICE_BUCKETS.find((b) => b.id === id)!.label}
        />
      </div>

      <div className="results-bar" aria-live="polite">
        <span>
          Showing <strong>{visible.length}</strong> of {projects.length}
        </span>
        {active && (
          <button type="button" className="link-btn" onClick={() => onFilters(EMPTY_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      <ul className="list" ref={listRef}>
        {sorted.map((p) => {
          const sk = statusKey(p.status);
          return (
            <li key={p.slug} data-slug={p.slug}>
              <button
                type="button"
                className="card"
                aria-current={props.selected === p.slug ? 'true' : undefined}
                onClick={() => props.onSelect(p.slug)}
              >
                {p.mainImage ? (
                  <img src={p.mainImage} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="img-ph" aria-hidden="true" />
                )}
                <span className="card-body">
                  <span className="card-title">{p.name}</span>
                  <span className="muted">{[p.sector, p.corridor].filter(Boolean).join(' · ') || p.address}</span>
                  <span className="card-price">{p.priceText ?? formatInr(p.priceInr) ?? ON_REQUEST}</span>
                  <span className="card-meta">
                    <i className="dot" style={{ background: STATUS_COLORS[sk] }} />
                    {p.status ?? 'Status on request'}
                    {p.configurationSummary ? ` · ${p.configurationSummary}` : ''}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {!sorted.length && <li className="empty">No projects match these filters.</li>}
      </ul>
      <footer className="side-foot muted">
        Data from <a href="https://whitecollarrealty.com/gurgaon-projects" target="_blank" rel="noopener">whitecollarrealty.com</a> · updated{' '}
        {new Date(props.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
      </footer>
    </aside>
  );
}
