import { useMemo, useState, type ReactNode } from "react";
import { type Index, type Evidence, nodeName, formatMoney, usdValue, ctlEffect, locateAny } from "../atlas";
import { LAYER_LABEL, FIN_LABEL, DOC_LABEL } from "../theme";
import { useStore } from "../store";

type Tab = "sites" | "routes" | "capital" | "rules" | "sources";

interface Col<R> { key: string; label: string; get: (r: R) => string | number; render?: (r: R) => ReactNode; num?: boolean; width?: string }
interface Spec<R> { rows: R[]; cols: Col<R>[]; id: (r: R) => string; evidence?: (r: R) => Evidence[]; url?: (r: R) => string }

const review = (r: { review: string }) => r.review;
const TABS: [Tab, string][] = [["sites", "Sites"], ["routes", "Routes"], ["capital", "Capital"], ["rules", "Trade rules"], ["sources", "Sources"]];

export default function DataTable({ idx }: { idx: Index }) {
  const { dataOpen, set, select, focus } = useStore();
  const [tab, setTab] = useState<Tab>("sites");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const citedBy = useMemo(() => {
    const m = new Map<string, number>();
    const all = [...idx.atlas.facilities, ...idx.atlas.flows, ...idx.atlas.financial_links, ...idx.atlas.controls, ...idx.atlas.companies];
    for (const e of all) for (const ev of e.evidence) m.set(ev.source, (m.get(ev.source) ?? 0) + 1);
    return m;
  }, [idx]);

  const spec = useMemo((): Spec<any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const a = idx.atlas;
    switch (tab) {
      case "sites": return {
        rows: a.facilities, id: (r) => r.id, evidence: (r) => [...r.evidence, ...(r.capacity?.evidence ?? [])],
        cols: [
          { key: "name", label: "Site", get: (r) => r.name, width: "26%" },
          { key: "stage", label: "Stage", get: (r) => LAYER_LABEL[r.layer as keyof typeof LAYER_LABEL] },
          { key: "op", label: "Operator", get: (r) => nodeName(idx, r.operator) },
          { key: "cc", label: "Country", get: (r) => r.country },
          { key: "status", label: "Status", get: (r) => r.status.replaceAll("_", " ") },
          { key: "cap", label: "Capacity", get: (r) => (r.capacity ? `${r.capacity.value.toLocaleString()} ${r.capacity.unit}` : "") },
          { key: "spof", label: "Cuts off", num: true, get: (r) => idx.ko.critical.get(r.id)?.length ?? 0 },
          { key: "reach", label: "Reach", num: true, get: (r) => idx.reach.get(r.id) ?? 0 },
          { key: "review", label: "Review", get: review },
          { key: "tier", label: "Tier", num: true, get: (r) => r.best_tier },
        ] };
      case "routes": return {
        rows: a.flows, id: (r) => r.id, evidence: (r) => r.evidence,
        cols: [
          { key: "from", label: "From", get: (r) => nodeName(idx, r.from_node), width: "20%" },
          { key: "to", label: "To", get: (r) => nodeName(idx, r.to_node), width: "20%" },
          { key: "what", label: "Commodity", get: (r) => r.commodity, width: "22%" },
          { key: "basis", label: "Basis", get: (r) => r.basis },
          { key: "drawn", label: "Drawn at", get: (r) => (r.resolution.includes("hq") ? "company HQ" : "site") },
          { key: "review", label: "Review", get: review },
          { key: "tier", label: "Tier", num: true, get: (r) => r.best_tier },
        ] };
      case "capital": return {
        rows: a.financial_links, id: (r) => r.id, evidence: (r) => r.evidence,
        cols: [
          { key: "from", label: "From", get: (r) => nodeName(idx, r.from), width: "20%" },
          { key: "to", label: "To", get: (r) => (r.to === r.from ? "(undisclosed counterparty)" : nodeName(idx, r.to)), width: "20%" },
          { key: "kind", label: "Kind", get: (r) => FIN_LABEL[r.kind] ?? r.kind },
          { key: "amt", label: "Amount", num: true, get: (r) => usdValue(r.amount), render: (r) => formatMoney(r.amount) },
          { key: "date", label: "Date", get: (r) => r.date },
          { key: "desc", label: "Description", get: (r) => r.description, width: "26%" },
          { key: "review", label: "Review", get: review },
        ] };
      case "rules": return {
        rows: a.controls, id: (r) => r.id, evidence: (r) => r.evidence,
        cols: [
          { key: "auth", label: "Authority", get: (r) => r.authority },
          { key: "inst", label: "Instrument", get: (r) => r.instrument, width: "30%" },
          { key: "cite", label: "Citation", get: (r) => r.citation },
          { key: "eff", label: "Effective", get: (r) => r.effective_date },
          { key: "status", label: "Status", get: (r) => r.status.replaceAll("_", " ") },
          { key: "effect", label: "Effect", get: (r) => ctlEffect(r) },
          { key: "to", label: "Destinations", get: (r) => r.applies_to.join(", "), width: "16%" },
          { key: "review", label: "Review", get: review },
        ] };
      case "sources": return {
        rows: a.sources, id: (r) => r.id, url: (r) => r.url,
        cols: [
          { key: "title", label: "Document", get: (r) => r.title, width: "34%" },
          { key: "pub", label: "Publisher", get: (r) => r.publisher },
          { key: "type", label: "Type", get: (r) => DOC_LABEL[r.doc_type] ?? r.doc_type },
          { key: "tier", label: "Tier", num: true, get: (r) => r.tier },
          { key: "date", label: "Date", get: (r) => r.document_date },
          { key: "id", label: "Identifier", get: (r) => r.identifier ?? "" },
          { key: "cited", label: "Cited by", num: true, get: (r) => citedBy.get(r.id) ?? 0 },
        ] };
    }
  }, [tab, idx, citedBy]);

  const rows = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let out = spec.rows;
    if (terms.length) out = out.filter((r) => { const t = spec.cols.map((c) => String(c.get(r))).join(" ").toLowerCase(); return terms.every((w) => t.includes(w)); });
    if (sort) {
      const c = spec.cols.find((x) => x.key === sort.key);
      if (c) out = [...out].sort((x, y) => { const a = c.get(x), b = c.get(y); return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))) * sort.dir; });
    }
    return out;
  }, [spec, q, sort]);

  if (!dataOpen) return null;

  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const head = [...spec.cols.map((c) => c.label), "id", ...(spec.evidence ? ["source_urls", "quotes"] : spec.url ? ["url"] : [])];
    const lines = rows.map((r) => {
      const base = spec.cols.map((c) => (c.render && c.key === "amt" ? formatMoney(r.amount) : c.get(r)));
      const ev = spec.evidence?.(r) ?? [];
      const extra = spec.evidence
        ? [ev.map((e) => idx.source.get(e.source)?.url).filter(Boolean).join(" | "), ev.map((e) => e.quote).join(" | ")]
        : spec.url ? [spec.url(r)] : [];
      return [...base, spec.id(r), ...extra].map(esc).join(",");
    });
    const blob = new Blob([[head.map(esc).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ai-supply-chain-atlas-${tab}-${idx.atlas.built_at.slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const open = (r: { id: string }) => {
    if (tab === "sources") { const u = spec.url?.(r); if (u) window.open(u, "_blank", "noopener"); return; }
    const mode = tab === "capital" ? "capital" : tab === "rules" ? "controls" : "network";
    set({ dataOpen: false, mode });
    select(r.id);
    const f = idx.flow.get(r.id);
    const p = locateAny(idx, f ? f.to_node : idx.fin.get(r.id)?.to ?? r.id);
    if (p) focus(p[0], p[1]);
  };

  return (
    <div className="scrim data-scrim" onClick={() => set({ dataOpen: false })}>
      <section className="datatable" onClick={(e) => e.stopPropagation()} aria-label="Data table">
        <header className="dt-head">
          <nav className="dt-tabs" role="tablist">
            {TABS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setSort(null); }}>
                {label} <span className="mono muted">{k === "sites" ? idx.atlas.facilities.length : k === "routes" ? idx.atlas.flows.length : k === "capital" ? idx.atlas.financial_links.length : k === "rules" ? idx.atlas.controls.length : idx.atlas.sources.length}</span>
              </button>
            ))}
          </nav>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter rows" />
          <button className="dt-csv" onClick={exportCsv} title="Download the filtered rows, with source URLs and verbatim quotes">⇩ CSV ({rows.length})</button>
          <button className="close" onClick={() => set({ dataOpen: false })} aria-label="Close table">✕</button>
        </header>
        <div className="dt-scroll">
          <table>
            <thead>
              <tr>{spec.cols.map((c) => (
                <th key={c.key} style={{ width: c.width }} className={c.num ? "num" : ""}
                  onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: c.num ? -1 : 1 }))}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                  {c.label}{sort?.key === c.key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={spec.id(r)} onClick={() => open(r)}>
                  {spec.cols.map((c) => (
                    <td key={c.key} className={`${c.num ? "num mono" : ""}${c.key === "review" ? ` rv-${c.get(r)}` : ""}`}>
                      {c.render ? c.render(r) : String(c.get(r))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="muted dt-empty">No rows match.</div>}
        </div>
        <footer className="dt-foot muted small">
          Click a row to show it on the globe (sources open the document). CSV includes each row's source URLs and verbatim quotes.
          “Cuts off” = campuses left with no recorded supplier of an input if this site goes down.
        </footer>
      </section>
    </div>
  );
}
