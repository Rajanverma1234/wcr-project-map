import { useMemo } from 'react';
import type { MappedProject, NearbyItem, PoiCategory } from '../../shared/types.ts';
import { CATEGORY_META, CATEGORY_ORDER, DRIVE_NOTE, SUMMARY_CATEGORIES, directionsUrl, distanceText } from '../lib/nearby.ts';

const sortKey = (it: NearbyItem) => it.driveKm ?? it.straightKm;

export default function NearbySection({
  project,
  items,
  majorHospital,
  status,
  highlight,
  onHighlight,
}: {
  project: MappedProject;
  items: NearbyItem[];
  majorHospital: NearbyItem | null;
  status: 'ready' | 'loading' | 'error';
  highlight: string | null;
  onHighlight: (poiId: string | null) => void;
}) {
  const grouped = useMemo(() => {
    const m = new Map<PoiCategory, NearbyItem[]>();
    for (const c of CATEGORY_ORDER) {
      const xs = items.filter((i) => i.category === c).sort((a, b) => sortKey(a) - sortKey(b));
      if (xs.length) m.set(c, xs);
    }
    return m;
  }, [items]);
  const from = project.lat !== null && project.lng !== null ? { lat: project.lat, lng: project.lng } : null;
  // Open by default on wide screens; collapsed on phones.
  const openByDefault = typeof window !== 'undefined' && window.innerWidth > 820;

  return (
    <details className="d-section nearby" open={openByDefault}>
      <summary>
        <h3>Nearby</h3>
      </summary>
      {status === 'loading' && <p className="fine">Loading nearby places…</p>}
      {status === 'error' && <p className="fine">Nearby places are not available right now.</p>}
      {status === 'ready' && !items.length && <p className="fine">No nearby places found for this location.</p>}
      {status === 'ready' && items.length > 0 && (
        <>
          {project.locationAccuracy === 'sector-approx' && project.locationSource !== 'override' && (
            <p className="fine">Distances are measured from the approximate pin, so treat them as a guide.</p>
          )}
          <ul className="nearby-summary">
            {SUMMARY_CATEGORIES.map((c) => {
              // Hospital summary = nearest *major* hospital; the list below keeps all hospitals.
              const isHospital = c === 'hospital';
              const it = isHospital ? majorHospital : grouped.get(c)?.[0];
              const m = CATEGORY_META[c];
              return (
                <li key={c}>
                  <span className="ns-icon" aria-hidden="true">
                    {m.icon}
                  </span>
                  <span className="ns-body">
                    <span className="ns-label">{isHospital ? 'Nearest major hospital' : `Nearest ${m.label.toLowerCase()}`}</span>
                    {it ? (
                      <button type="button" className="ns-name" onClick={() => onHighlight(it.poiId)}>
                        {it.name}: {distanceText(it).text}
                      </button>
                    ) : (
                      <span className="on-request">{c === 'airport' ? 'Not available' : 'None within 10 km'}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="fine drive-note">
            <strong>km · min drive</strong> = road distance and time, {DRIVE_NOTE.replace(/^Drive distance and time are /, '')}{' '}
            <strong>straight line</strong> = shown only when no road route was found.
          </p>

          {[...grouped.entries()].map(([cat, xs]) => (
            <div key={cat} className="nearby-group">
              <h4>
                <span aria-hidden="true">{CATEGORY_META[cat].icon}</span> {CATEGORY_META[cat].label}
              </h4>
              <ul>
                {xs.map((it) => {
                  const d = distanceText(it);
                  return (
                    <li key={it.poiId} className={highlight === it.poiId ? 'is-active' : undefined}>
                      <button
                        type="button"
                        className="nearby-row"
                        aria-pressed={highlight === it.poiId}
                        onClick={() => onHighlight(highlight === it.poiId ? null : it.poiId)}
                        title="Show on map"
                      >
                        <span className="nr-name">
                          {it.name}
                          {it.major && <span className="badge-major">Major</span>}
                        </span>
                        <span className={`nr-dist ${d.isDrive ? '' : 'is-straight'}`}>
                          {d.text}
                          {d.isDrive && <span className="nr-approx"> · approx, without traffic</span>}
                        </span>
                      </button>
                      {from && (
                        <a className="nr-dir" href={directionsUrl(from, it)} target="_blank" rel="noopener" aria-label={`Directions to ${it.name}`}>
                          Directions
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="fine">Places: © OpenStreetMap contributors. Routing: OSRM.</p>
        </>
      )}
    </details>
  );
}
