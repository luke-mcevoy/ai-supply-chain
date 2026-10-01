import { useEffect, useMemo, useRef, useState } from "react";
import { CHAIN, type Index, nodeName, locateAny, formatMoney, traverse, ctlEffect, cutOff } from "../atlas";
import { LAYER_COLOR, LAYER_LABEL, LAYER_CODE, FIN_LABEL, DOC_LABEL, css } from "../theme";
import { useStore, type Mode } from "../store";
import { activeControls } from "../Globe";
import { defaultAnchors, startTour } from "./Tour";

// ─── Top bar ────────────────────────────────────────────────────────────────

export function TopBar({ idx }: { idx: Index }) {
  const { mode, setMode, set } = useStore();
  const t12 = idx.atlas.sources.filter((s) => s.tier <= 2).length;
  const pct = idx.atlas.sources.length ? Math.floor((1000 * t12) / idx.atlas.sources.length) / 10 : 0;
  const modes: [Mode, string, string][] = [
    ["network", "Network", "Physical supply routes, mine to megawatt"],
    ["capital", "Capital", "Who pays whom: investments, contracts, subsidies"],
    ["controls", "Controls", "Export controls: who can't get what, over time"],
  ];
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" /><ellipse cx="12" cy="12" rx="4.5" ry="10" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M2 12h20" stroke="currentColor" strokeWidth="1.2" /></svg>
        <span className="brand-name">AI SUPPLY CHAIN ATLAS</span>
        {idx.atlas.draft && <span className="draft-flag" title="Built with --draft: includes unverified research. Not for publication.">DRAFT BUILD</span>}
      </div>
      <nav className="modes" role="tablist">
        {modes.map(([m, label, title]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "on" : ""} title={title} onClick={() => setMode(m)}>{label}</button>
        ))}
      </nav>
      <div className="top-right">
        <button className="walk-btn story-btn" onClick={() => set({ storyPicker: true })} title="Guided stories with verbatim, sourced quotes">◆ <span>Stories</span></button>
        <button className="walk-btn" onClick={() => { const a = defaultAnchors(idx); if (a.campus) { set({ mode: "network" }); startTour(a.campus, "up"); } }}
          title="Step through the supply chain, stage by stage">▶ <span>Walk the chain</span></button>
        <button className="search-btn" onClick={() => set({ paletteOpen: true })}><span>Search</span><kbd>⌘K</kbd></button>
        <div className="meta mono" title="Share of cited documents that are legal/regulatory (T1) or company-primary (T2)">
          {idx.atlas.sources.length} SOURCES · {pct}% T1/T2
        </div>
        <button className="about-btn data-btn" onClick={() => set({ dataOpen: true })} title="Every site, route, deal, rule and source as a sortable table, with CSV export">Data</button>
        <button className="about-btn" onClick={() => set({ aboutOpen: true })}>Method</button>
      </div>
    </header>
  );
}

// ─── Left rail: chain stages, filters, chokepoints, scenarios ──────────────

export function Rail({ idx }: { idx: Index }) {
  const s = useStore();
  const counts = useMemo(() => {
    const m = new Map<string, { f: number; v: number }>();
    for (const f of idx.atlas.facilities) {
      const c = m.get(f.layer) ?? { f: 0, v: 0 };
      c.f++; if (f.review === "verified") c.v++;
      m.set(f.layer, c);
    }
    return m;
  }, [idx]);
  const spof = useMemo(() => [...idx.ko.critical]
    .map(([id, hits]) => ({ id, n: hits.length, doc: idx.ko.criticalDoc.get(id) ?? 0, kinds: [...new Set(hits.map((h) => h.kind))] }))
    .sort((a, b) => b.doc - a.doc || b.n - a.n), [idx]);
  const [showInferredSpof, setShowInferredSpof] = useState(false);
  const spofShown = spof.filter((r) => showInferredSpof || r.doc > 0);
  const inferredOnly = spof.filter((r) => r.doc === 0).length;
  const exposure = useMemo(() => {
    if (!s.severed.size) return null;
    const seeds: string[] = [];
    for (const id of s.severed) {
      if (id.startsWith("country:")) { for (const f of idx.atlas.facilities) if (f.country === id.slice(8)) seeds.push(f.id); }
      else seeds.push(id);
    }
    const { nodes, flows } = traverse(idx, seeds, "down");
    const dcs = [...nodes].map((n) => idx.facility.get(n)).filter((f) => f?.layer === "datacenter");
    return { sites: nodes.size, flows: flows.size, dcs: dcs.length, cut: cutOff(idx, seeds).length };
  }, [s.severed, idx]);
  const scenarios: [string, string][] = [["TW", "Taiwan"], ["KR", "South Korea"], ["NL", "Netherlands"], ["JP", "Japan"], ["CN", "China"]];

  if (!s.railOpen) return <button className="rail-toggle" onClick={() => s.set({ railOpen: true })} aria-label="Open panel">☰</button>;
  return (
    <aside className="panel rail">
      <button className="close" onClick={() => s.set({ railOpen: false })} aria-label="Collapse panel">‹</button>
      <h3>The chain</h3>
      <ol className="chain">
        {CHAIN.map((l, i) => {
          const c = counts.get(l);
          const on = s.layers.has(l);
          return (
            <li key={l} className={on ? "" : "off"}>
              <button className="stage" onClick={() => s.toggleLayer(l)} onDoubleClick={() => s.soloLayer(l)} title="Click to toggle · double-click to solo">
                <span className="stage-n mono">{String(i + 1).padStart(2, "0")}</span>
                <i className="swatch" style={{ background: css(LAYER_COLOR[l]), boxShadow: on ? `0 0 10px ${css(LAYER_COLOR[l], 0.6)}` : "none" }} />
                <span className="stage-name">{LAYER_LABEL[l]}</span>
                <span className="stage-count mono">{c?.f ?? 0}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <button className="rail-data" onClick={() => s.set({ dataOpen: true })}>▦ Open data table · CSV</button>

      <h3>Evidence filters</h3>
      <label className="check"><input type="checkbox" checked={s.showInferred} onChange={(e) => s.set({ showInferred: e.target.checked })} /> Inferred routes <span className="muted">(dashed)</span></label>
      <label className="check"><input type="checkbox" checked={s.showFlagged} onChange={(e) => s.set({ showFlagged: e.target.checked })} /> Flagged / Tier-3 items</label>
      <label className="check"><input type="checkbox" checked={s.showPlanned} onChange={(e) => s.set({ showPlanned: e.target.checked })} /> Announced / planned sites</label>

      <h3>Walk the chain</h3>
      <div className="scenario">
        <button onClick={() => { const a = defaultAnchors(idx); if (a.mine) { s.set({ mode: "network" }); startTour(a.mine, "down"); } }}>Mine → campus</button>
        <button onClick={() => { const a = defaultAnchors(idx); if (a.campus) { s.set({ mode: "network" }); startTour(a.campus, "up"); } }}>Campus → mine</button>
      </div>

      <h3>What-if: sever a country</h3>
      <div className="scenario">
        {scenarios.map(([cc, name]) => (
          <button key={cc} className={s.severed.has(`country:${cc}`) ? "on danger" : ""} onClick={() => s.toggleSever(`country:${cc}`)}>{name}</button>
        ))}
      </div>
      {exposure && (
        <div className="exposure">
          <div><b className="mono danger-t">{exposure.cut}</b> AI campuses cut off · <b className="mono">{exposure.dcs}</b> exposed</div>
          <div className="muted small"><b>Cut off</b>: a campus loses every recorded supplier of some input (e.g. all its recorded GPU sources). <b>Exposed</b>: at least one input passes through a severed site. Neither models inventory or suppliers missing from the data.</div>
          <button className="linkish" onClick={() => s.set({ severed: new Set() })}>Clear</button>
        </div>
      )}

      <h3 title="Remove one site or company; count AI campuses that then have no recorded supplier left for some input. Suppliers of the same kind of input count as substitutes. The dataset is incomplete, so 'no recorded alternative' is not proof there is none.">Single points of failure</h3>
      <div className="muted small spof-note">Campuses left with no recorded supplier of an input if this one node goes down, counting documented routes; <span className="mono">+inf</span> = more if inferred routes are included.</div>
      <ol className="choke">
        {spofShown.map((r) => {
          const p = locateAny(idx, r.id);
          const l = idx.facility.get(r.id)?.layer ?? idx.company.get(r.id)?.layers?.[0];
          return (
            <li key={r.id}>
              <button onClick={() => { s.select(r.id); if (p) s.focus(p[0], p[1], 2.6); }} title={`Cuts off ${r.n} campus(es): ${r.kinds.join(", ")}`}>
                <i className="dot" style={{ background: l ? css(LAYER_COLOR[l]) : "#999" }} />
                <span className="choke-name">{nodeName(idx, r.id)}<span className="muted small"> · {r.kinds[0]}</span></span>
                <span className="mono choke-n">{r.doc}{r.n > r.doc && <span className="muted small"> +{r.n - r.doc} inf</span>}</span>
              </button>
            </li>
          );
        })}
        {!spofShown.length && <li className="muted small">None in the recorded data.</li>}
        {inferredOnly > 0 && (
          <li><button className="linkish" onClick={() => setShowInferredSpof((v) => !v)}>
            {showInferredSpof ? "Hide" : "Show"} {inferredOnly} that appear only through inferred routes
          </button></li>
        )}
      </ol>
    </aside>
  );
}

// ─── Hover tooltip ──────────────────────────────────────────────────────────

export function Tooltip({ idx }: { idx: Index }) {
  const hover = useStore((s) => s.hover);
  if (!hover) return null;
  const { id, x, y } = hover;
  let title = "", sub = "", color = "";
  const f = idx.facility.get(id);
  const fl = idx.flow.get(id);
  const fin = idx.fin.get(id);
  if (f) { title = f.name; sub = `${LAYER_CODE[f.layer]} · ${nodeName(idx, f.operator)} · ${f.status.replaceAll("_", " ")}`; color = css(LAYER_COLOR[f.layer]); }
  else if (fl) { title = fl.commodity; sub = `${nodeName(idx, fl.from_node)} → ${nodeName(idx, fl.to_node)} · ${fl.basis}`; color = css(LAYER_COLOR[fl.layer] ?? [200, 200, 200]); }
  else if (fin) { title = `${formatMoney(fin.amount)} · ${FIN_LABEL[fin.kind] ?? fin.kind}`; sub = `${nodeName(idx, fin.from)} → ${nodeName(idx, fin.to)} · ${fin.date}`; color = css([240, 196, 80]); }
  else if (id.startsWith("country:")) { title = id.slice(8); sub = "Click for controls"; }
  else if (id.includes(">")) { const [a, b] = id.split(">"); title = `${a} ✕ ${b}`; sub = "Restricted export route · click for rule"; color = css([236, 84, 88]); }
  else { title = nodeName(idx, id); sub = idx.company.get(id)?.country ?? ""; }
  return (
    <div className="tooltip" style={{ left: x + 14, top: y + 14, borderLeftColor: color || undefined }}>
      <div className="tt-title">{title}</div>
      <div className="tt-sub">{sub}</div>
    </div>
  );
}

// ─── Bottom: legend / controls timeline ─────────────────────────────────────

export function Bottom({ idx }: { idx: Index }) {
  const mode = useStore((s) => s.mode);
  const touring = useStore((s) => !!s.tour || !!s.story);
  if (touring) return null;
  if (mode === "controls") return <Timeline idx={idx} />;
  return (
    <div className="legend">
      {mode === "network" ? (
        <>
          <span><i className="lg-line" /> Documented route</span>
          <span><i className="lg-line dashed" /> Inferred route</span>
          <span><i className="lg-dot" /> Node size = downstream AI campuses</span>
          <span><i className="lg-dot ring" /> Amber ring = flagged evidence</span>
        </>
      ) : (
        <>
          <span><i className="lg-line" style={{ background: "#f0c450" }} /> Equity / JV</span>
          <span><i className="lg-line" style={{ background: "#46ceb4" }} /> Contracts & commitments</span>
          <span><i className="lg-line" style={{ background: "#60a0ff" }} /> Government</span>
          <span><i className="lg-line" style={{ background: "#ec8c48" }} /> Debt</span>
          <span><i className="lg-dot ring" style={{ borderColor: "#46ceb4" }} /> Capex / backlog / unnamed counterparty</span>
          <span><i className="lg-line dashed" /> Undisclosed amount</span>
          <span className="muted">Width ∝ log(amount)</span>
        </>
      )}
    </div>
  );
}

function Timeline({ idx }: { idx: Index }) {
  const { controlDate, set, select, ctlBloc } = useStore();
  const start = Date.parse("2019-01-01");
  const end = Date.now() + 30 * 864e5;
  const ticks = idx.atlas.controls
    .map((c) => ({ c, t: idx.controlSpan.get(c.id)?.[0] ?? NaN }))
    .filter((x) => x.t >= start && x.t <= end);
  const active = activeControls(idx, controlDate)
    .filter((c) => ctlEffect(c) === "restrict")
    .filter((c) => ctlBloc === "all" || (ctlBloc === "cn") === c.authority.startsWith("CN"));
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => ((t - start) / (end - start)) * 100;
  const drag = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    set({ controlDate: start + f * (end - start) });
  };
  const years = [];
  for (let y = 2019; y <= new Date().getFullYear(); y++) years.push(y);
  return (
    <div className="timeline">
      <div className="tl-head">
        <span className="mono">{new Date(controlDate).toISOString().slice(0, 10)}</span>
        <span className="muted">{active.length} export restrictions in force · red = restricted destination, blue = imposing jurisdiction · white dots = named restricted parties · green ticks = suspensions, grey = import measures</span>
        <span className="seg" role="radiogroup" aria-label="Imposed by">
          {([["allies", "US & allies"], ["cn", "China"], ["all", "All"]] as const).map(([k, label]) => (
            <button key={k} role="radio" aria-checked={ctlBloc === k} className={ctlBloc === k ? "on" : ""} onClick={() => set({ ctlBloc: k })}>{label}</button>
          ))}
        </span>
        <button className="linkish" onClick={() => set({ controlDate: Date.now() })}>Today</button>
      </div>
      <div className="tl-track" ref={trackRef}
        onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) drag(e.clientX); }}>
        {years.map((y) => <span key={y} className="tl-year mono" style={{ left: `${pct(Date.parse(`${y}-01-01`))}%` }}>{y}</span>)}
        {ticks.map(({ c, t }) => (
          <button key={c.id} className={`tl-tick a-${c.authority.split("-")[0].toLowerCase()} e-${ctlEffect(c)}`} style={{ left: `${pct(t)}%` }}
            title={`${c.effective_date} · ${c.authority} · ${c.citation}`}
            onClick={(e) => { e.stopPropagation(); set({ controlDate: t + 864e5 }); select(c.id); }} />
        ))}
        <div className="tl-cursor" style={{ left: `${pct(controlDate)}%` }} />
      </div>
    </div>
  );
}

// ─── ⌘K palette ─────────────────────────────────────────────────────────────

interface Hit { id: string; label: string; sub: string; kind: string }

export function Palette({ idx }: { idx: Index }) {
  const { paletteOpen, set, select, focus } = useStore();
  const [q, setQ] = useState("");
  const [cur, setCur] = useState(0);
  const all: Hit[] = useMemo(() => [
    ...idx.atlas.facilities.map((f) => ({ id: f.id, label: f.name, sub: `${LAYER_LABEL[f.layer]} · ${nodeName(idx, f.operator)} · ${f.country}`, kind: LAYER_CODE[f.layer] })),
    ...idx.atlas.companies.map((c) => ({ id: c.id, label: c.name, sub: `Company · ${c.country}`, kind: "CO" })),
    ...idx.atlas.controls.map((c) => ({ id: c.id, label: c.instrument, sub: `${c.authority} · ${c.citation} · ${c.effective_date}`, kind: "CTL" })),
    ...idx.atlas.financial_links.map((f) => ({ id: f.id, label: `${nodeName(idx, f.from)} → ${nodeName(idx, f.to)}`, sub: `${FIN_LABEL[f.kind] ?? f.kind} · ${formatMoney(f.amount)} · ${f.date}`, kind: "FIN" })),
    ...idx.atlas.flows.map((f) => ({ id: f.id, label: f.commodity, sub: `${nodeName(idx, f.from_node)} → ${nodeName(idx, f.to_node)}`, kind: "RTE" })),
  ], [idx]);
  const hits = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return all.filter((h) => h.kind !== "RTE").slice(0, 12);
    return all.filter((h) => terms.every((t) => `${h.label} ${h.sub}`.toLowerCase().includes(t))).slice(0, 40);
  }, [q, all]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); set({ paletteOpen: !useStore.getState().paletteOpen }); }
      if (e.key === "Escape") set({ paletteOpen: false, aboutOpen: false, dataOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [set]);
  useEffect(() => { setCur(0); }, [q]);

  if (!paletteOpen) return null;
  const choose = (h: Hit) => {
    select(h.id);
    const f = idx.flow.get(h.id);
    const p = locateAny(idx, f ? f.to_node : idx.fin.get(h.id)?.to ?? h.id);
    if (p) focus(p[0], p[1]);
    if (h.kind === "FIN") set({ mode: "capital" });
    if (h.kind === "CTL") set({ mode: "controls" });
    set({ paletteOpen: false });
    setQ("");
  };
  return (
    <div className="scrim" onClick={() => set({ paletteOpen: false })}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input autoFocus placeholder="Search sites, companies, rules, deals…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setCur((c) => Math.min(hits.length - 1, c + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setCur((c) => Math.max(0, c - 1)); }
            if (e.key === "Enter" && hits[cur]) choose(hits[cur]);
          }} />
        <ul>
          {hits.map((h, i) => (
            <li key={h.id} className={i === cur ? "cur" : ""} onMouseEnter={() => setCur(i)} onClick={() => choose(h)}>
              <span className="pk mono">{h.kind}</span>
              <span className="pl">{h.label}</span>
              <span className="ps">{h.sub}</span>
            </li>
          ))}
          {!hits.length && <li className="muted">No matches.</li>}
        </ul>
      </div>
    </div>
  );
}

// ─── Methodology ────────────────────────────────────────────────────────────

export function About({ idx }: { idx: Index }) {
  const { aboutOpen, set } = useStore();
  if (!aboutOpen) return null;
  const a = idx.atlas;
  const tiers = [1, 2, 3].map((t) => a.sources.filter((s) => s.tier === t).length);
  const docTypes = Object.entries(a.sources.reduce<Record<string, number>>((m, s) => ((m[s.doc_type] = (m[s.doc_type] ?? 0) + 1), m), {}))
    .sort((x, y) => y[1] - x[1]);
  const flowsDoc = a.flows.filter((f) => f.basis === "documented").length;
  return (
    <div className="scrim" onClick={() => set({ aboutOpen: false })}>
      <article className="about" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={() => set({ aboutOpen: false })}>✕</button>
        <h1>Method</h1>
        <p className="lede">Every site, route, dollar and trade rule on this globe traces to a quoted passage in a primary document. A separate verification pass re-fetched every document and checked every quote before anything was published.</p>
        <div className="stat-row">
          <div><b className="mono">{a.facilities.length}</b><span>sites</span></div>
          <div><b className="mono">{a.flows.length}</b><span>routes ({flowsDoc} documented)</span></div>
          <div><b className="mono">{a.financial_links.length}</b><span>money flows</span></div>
          <div><b className="mono">{a.controls.length}</b><span>trade rules</span></div>
          <div><b className="mono">{a.sources.length}</b><span>source documents</span></div>
        </div>
        <h2>Evidence tiers</h2>
        <table className="tbl">
          <tbody>
            <tr><td><span className="tier t1">T1</span></td><td>Legal &amp; regulatory primary documents: SEC filings, statutory annual reports, the Federal Register and CFR, the BIS Entity List, government awards and contracts, FERC/NRC/PUC dockets, permits, and USGS/EIA/GAO reports.</td><td className="mono">{tiers[0]}</td></tr>
            <tr><td><span className="tier t2">T2</span></td><td>Company primary: earnings calls, investor presentations, official releases.</td><td className="mono">{tiers[1]}</td></tr>
            <tr><td><span className="tier t3">T3</span></td><td>Secondary sources, used only when no primary source exists. Always flagged.</td><td className="mono">{tiers[2]}</td></tr>
          </tbody>
        </table>
        <h2>Pipeline</h2>
        <ol className="pipeline">
          <li><b>Analysts</b>, one per stage of the chain, extract claims with verbatim quotes and exact locators.</li>
          <li><b>Counsel</b> independently re-fetches every document. Each quote is marked verified, not found, doesn't support, superseded, insufficient tier, or unreachable. Anything unsupported is withheld.</li>
          <li><b>Build</b> publishes only items with a publish verdict, drops failed evidence, and applies counsel's corrections.</li>
        </ol>
        <h2>How to read the map</h2>
        <ul>
          <li><b>Documented</b> routes (solid) have a primary source naming both parties. <b>Inferred</b> routes (dashed) are deduced from documented facts, and the deduction is shown on each one.</li>
          <li>Where a document names a company but not a site, the route is drawn at a specific site only if the route's own evidence names it, or the company has exactly one site. Otherwise it is drawn from the company's headquarters. The inspector says when this happens.</li>
          <li><b>Single points of failure</b>: remove one site or company, and count the AI campuses left with no recorded supplier for some input. Suppliers of the same kind of input (two wafer makers, say) count as substitutes; different inputs (wafers and lithography) are all required. An inferred route can add an alternative supplier but can't add a new requirement to a company whose inputs are documented. <b>Documented requirements</b> (such as a fab's documented use of EUV, combined with a filing stating ASML is the only maker) add hard needs, but only once fully verified; flagged ones are shown and don't feed the analysis. Results show how many hold on documented routes alone. The data is incomplete, so “no recorded alternative” is not proof that none exists.</li>
          <li>The severance what-if shows <i>exposure</i>, not failure. It doesn't model inventory, second sources or substitution.</li>
          <li>Trade rules are shown as in force between their effective date and the date of the rule that superseded them.</li>
        </ul>
        <h2>Document types</h2>
        <div className="doc-types">{docTypes.map(([k, n]) => <span key={k}>{DOC_LABEL[k] ?? k} <b className="mono">{n}</b></span>)}</div>
        <h2>Known gaps <span className="muted small">({a.gaps.length})</span></h2>
        <p className="muted small">These could not be sourced to Tier 1 or Tier 2, so they are left off the globe instead of estimated.</p>
        <ul className="gaps">{a.gaps.map((g, i) => <li key={i}><b>{g.topic}</b><span className="muted"> · {LAYER_LABEL[g.layer] ?? g.layer}</span><div className="small">{g.why} <i>Would need: {g.would_need}</i></div></li>)}</ul>
        <p className="muted small">Built {a.built_at.slice(0, 10)}. This is not legal or investment advice. Descriptions restate what the cited documents say.</p>
      </article>
    </div>
  );
}
