import { useEffect, useRef, useState } from 'react';
import type { MappedProject, NearbyItem, Office, TextFact } from '../../shared/types.ts';
import { ON_REQUEST, STATUS_COLORS, formatInr, statusKey } from '../lib/format.ts';
import NearbySection from './NearbySection.tsx';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd className={value === null || value === undefined || value === '' ? 'on-request' : undefined}>
        {value === null || value === undefined || value === '' ? ON_REQUEST : value}
      </dd>
    </div>
  );
}

function Fact({ fact }: { fact: TextFact | null }) {
  if (!fact) return null;
  return <span title={`From the project page: “${fact.evidence}”`}>{fact.value}</span>;
}

function Section({ title, children, show = true }: { title: string; children: React.ReactNode; show?: boolean }) {
  if (!show) return null;
  return (
    <section className="d-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function ProjectDetails({
  project: p,
  office,
  onClose,
  nearbyItems,
  majorHospital,
  nearbyStatus,
  highlight,
  onHighlight,
}: {
  project: MappedProject;
  office: Office | null;
  onClose: () => void;
  nearbyItems: NearbyItem[];
  majorHospital: NearbyItem | null;
  nearbyStatus: 'ready' | 'loading' | 'error';
  highlight: string | null;
  onHighlight: (poiId: string | null) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const images = [p.mainImage, ...p.gallery].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  const [imgIdx, setImgIdx] = useState(0);

  useEffect(() => {
    setImgIdx(0);
    scrollRef.current?.scrollTo({ top: 0 });
    closeRef.current?.focus({ preventScroll: true });
  }, [p.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const phone = office?.phones[0] ?? null;
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const waDigits = phone?.replace(/\D/g, '').replace(/^0+/, '');
  const waHref = waDigits
    ? `https://wa.me/${waDigits.length === 10 ? '91' + waDigits : waDigits}?text=${encodeURIComponent(`Hi White Collar Realty, I am interested in ${p.name}.`)}`
    : null;
  const directions = p.lat !== null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : null;
  const sk = statusKey(p.status);
  const priceRange =
    p.priceMinInr !== null && p.priceMaxInr !== null && p.priceMaxInr > p.priceMinInr
      ? `${formatInr(p.priceMinInr)} – ${formatInr(p.priceMaxInr)}`
      : null;

  return (
    <aside className="details" role="dialog" aria-modal="false" aria-labelledby="d-title">
      <div className="d-head">
        <div>
          <h2 id="d-title">{p.name}</h2>
          <p className="muted">{p.address ?? ON_REQUEST}</p>
        </div>
        <button ref={closeRef} type="button" className="icon-btn" onClick={onClose} aria-label="Close project details">
          ✕
        </button>
      </div>

      <div className="d-scroll" ref={scrollRef}>
        {/* exact or manual override: no note */}
        {p.locationSource !== 'override' && p.locationAccuracy === 'geocoded' && (
          <p className="approx-note is-light" role="note">
            📍 Pin from map data (OpenStreetMap); it may be off by a few hundred metres.
          </p>
        )}
        {p.locationSource !== 'override' && p.locationAccuracy === 'sector-approx' && (
          <p className="approx-note" role="note">
            📍 Approximate location{p.locationNote ? ` — ${p.locationNote.replace(/^Approximate:\s*/i, '')}` : ''}. The pin is not the exact site, so treat
            distances as a rough guide.
          </p>
        )}

        {images.length > 0 && (
          <div className="gallery">
            <a href={images[imgIdx]} target="_blank" rel="noopener" className="gallery-main">
              <img src={images[imgIdx]} alt={`${p.name} — image ${imgIdx + 1} of ${images.length}`} />
            </a>
            {images.length > 1 && (
              <div className="thumbs" role="list" aria-label="Gallery">
                {images.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    role="listitem"
                    aria-label={`Show image ${i + 1}`}
                    aria-pressed={i === imgIdx}
                    onClick={() => setImgIdx(i)}
                  >
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="d-price">
          <span className="big">{p.priceText ?? formatInr(p.priceInr) ?? ON_REQUEST}</span>
          {priceRange && <span className="muted">Range on page: {priceRange}</span>}
        </div>

        <div className="actions">
          {telHref && (
            <a className="btn primary" href={telHref}>
              Call {phone}
            </a>
          )}
          <a className="btn" href={`${p.sourceUrl}#contact`} target="_blank" rel="noopener">
            Enquire
          </a>
          {waHref && (
            <a className="btn" href={waHref} target="_blank" rel="noopener">
              WhatsApp
            </a>
          )}
          {directions && (
            <a className="btn" href={directions} target="_blank" rel="noopener">
              Directions
            </a>
          )}
          <a className="btn" href={p.sourceUrl} target="_blank" rel="noopener">
            View on website ↗
          </a>
        </div>

        <dl className="fields">
          <Field label="Developer" value={p.developer} />
          <Field label="Sector" value={p.sector} />
          <Field label="Road / corridor" value={p.road} />
          <Field label="Category" value={p.category === 'commercial' ? 'Commercial' : 'Residential'} />
          <Field label="Type" value={p.propertyType} />
          <Field label="Configurations" value={p.configurationSummary} />
          <Field label="Area" value={p.areaText} />
          <Field
            label="Status"
            value={
              p.status && (
                <>
                  <i className="dot" style={{ background: STATUS_COLORS[sk] }} /> {p.status}
                </>
              )
            }
          />
          <Field label="Possession" value={p.possession} />
          <Field
            label="RERA"
            value={
              p.reraNumbers.length ? (
                <>
                  {p.reraNumbers.map((r) => (
                    <span key={r.value} className="rera" title={`From the project page: “${r.evidence}”`}>
                      {r.value}
                    </span>
                  ))}
                </>
              ) : null
            }
          />
          <Field label="Land area" value={p.landArea && <Fact fact={p.landArea} />} />
          <Field label="Towers" value={p.towers && <Fact fact={p.towers} />} />
          <Field label="Units" value={p.units && <Fact fact={p.units} />} />
        </dl>
        {(p.landArea || p.towers || p.units) && (
          <p className="fine">Land area, towers and units are taken from the project page's text; hover a value to see the sentence.</p>
        )}

        <NearbySection
          project={p}
          items={nearbyItems}
          majorHospital={majorHospital}
          status={nearbyStatus}
          highlight={highlight}
          onHighlight={onHighlight}
        />

        <Section title="Sizes & prices" show={!!p.sizesTable}>
          {p.sizesTable && (
            <div className="table-wrap">
              <table>
                {p.sizesTable.headers.length > 0 && (
                  <thead>
                    <tr>
                      {p.sizesTable.headers.map((h, i) => (
                        <th key={i} scope="col">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                )}
                <tbody>
                  {p.sizesTable.rows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c || '–'}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {p.sizesNotes && <p className="fine">{p.sizesNotes}</p>}
        </Section>

        <Section title="Floor plans" show={p.floorPlans.length > 0}>
          <div className="plans">
            {p.floorPlans.map((f) => (
              <a key={f.url} href={f.url} target="_blank" rel="noopener">
                <img src={f.url} alt={f.label ?? 'Floor plan'} loading="lazy" />
                <span>{f.label ?? 'Floor plan'}</span>
              </a>
            ))}
          </div>
        </Section>

        <Section title="About" show={!!p.description}>
          {p.description?.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
        </Section>

        <Section title="Highlights" show={p.highlights.length > 0}>
          <ul className="bullets">{p.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </Section>

        <Section title="Amenities" show={p.amenities.length > 0}>
          <ul className="tags">{p.amenities.map((a, i) => <li key={i}>{a.replace(/\.$/, '')}</li>)}</ul>
        </Section>

        <Section title="Location advantages" show={p.locationAdvantages.length > 0}>
          <ul className="bullets">{p.locationAdvantages.map((h, i) => <li key={i}>{h}</li>)}</ul>
          {p.locationMapImage && (
            <a href={p.locationMapImage} target="_blank" rel="noopener" className="loc-map">
              <img src={p.locationMapImage} alt={`${p.name} location map from the website`} loading="lazy" />
            </a>
          )}
        </Section>

        <Section title="Features" show={p.features.length > 0}>
          <dl className="features">
            {p.features.map((f, i) => (
              <div key={i}>
                <dt>{f.title}</dt>
                {f.text && <dd>{f.text}</dd>}
              </div>
            ))}
          </dl>
        </Section>

        <Section title="Brochure & video" show={!!(p.brochureUrl || p.videoUrl)}>
          <div className="actions">
            {p.brochureUrl && (
              <a className="btn" href={p.brochureUrl} target="_blank" rel="noopener">
                Brochure (PDF)
              </a>
            )}
            {p.videoUrl && (
              <a className="btn" href={p.videoUrl.replace('/embed/', '/watch?v=')} target="_blank" rel="noopener">
                Video tour
              </a>
            )}
          </div>
        </Section>

        <Section title="FAQs" show={p.faqs.length > 0}>
          {p.faqs.map((f, i) => (
            <details key={i} className="faq">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </Section>

        <p className="fine source">
          Source: <a href={p.sourceUrl} target="_blank" rel="noopener">{p.sourceUrl.replace('https://', '')}</a> · scraped{' '}
          {new Date(p.scrapedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      </div>
    </aside>
  );
}
