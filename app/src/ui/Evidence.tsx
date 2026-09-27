import type { Evidence, Index, Review } from "../atlas";
import { DOC_LABEL } from "../theme";

export function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  return <span className={`tier t${tier}`} title={tier === 1 ? "Tier 1 — legal / regulatory primary document" : tier === 2 ? "Tier 2 — company primary document" : "Tier 3 — secondary source (flagged)"}>T{tier}</span>;
}

export function ReviewBadge({ review, note }: { review: Review; note?: string }) {
  const label = review === "verified" ? "VERIFIED" : review === "flagged" ? "FLAGGED" : "UNVERIFIED DRAFT";
  return <span className={`review r-${review}`} title={note}>{label}</span>;
}

export function EvidenceList({ idx, evidence }: { idx: Index; evidence: Evidence[] }) {
  if (!evidence.length) return <div className="muted small">No surviving evidence.</div>;
  const sorted = [...evidence].sort((a, b) => (idx.source.get(a.source)?.tier ?? 3) - (idx.source.get(b.source)?.tier ?? 3));
  return (
    <div className="evidence">
      {sorted.map((ev, i) => {
        const src = idx.source.get(ev.source);
        return (
          <div className="ev" key={i}>
            <div className="ev-head">
              {src && <TierBadge tier={src.tier} />}
              <span className="ev-doc">{src ? DOC_LABEL[src.doc_type] ?? src.doc_type : "Unknown source"}</span>
              <span className="ev-date mono">{src?.document_date}</span>
            </div>
            <blockquote>“{ev.quote}”</blockquote>
            <div className="ev-meta">
              <span className="ev-supports">supports: {ev.supports}</span>
              <span className="ev-loc mono">{ev.locator}</span>
            </div>
            {src && (
              <a className="ev-src" href={src.url} target="_blank" rel="noreferrer noopener">
                <span className="ev-title">{src.title}</span>
                <span className="ev-pub">{src.publisher}{src.identifier ? ` · ${src.identifier}` : ""} ↗</span>
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
