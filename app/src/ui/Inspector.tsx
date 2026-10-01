import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  type Index, type Facility, type Company, type Flow, type FinancialLink, type Control,
  nodeName, nodeLayer, locateAny, formatMoney, traverse, ctlEffect,
} from "../atlas";
import { LAYER_COLOR, LAYER_CODE, LAYER_LABEL, FIN_LABEL, css } from "../theme";
import { useStore } from "../store";
import { EvidenceList, ReviewBadge, TierBadge } from "./Evidence";
import { activeControls } from "../Globe";
import { startTour } from "./Tour";

export default function Inspector({ idx }: { idx: Index }) {
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const [peek, setPeek] = useState(false);
  useEffect(() => setPeek(false), [selected]);
  if (!selected) return null;

  let body: ReactNode = <div className="muted">Not found: {selected}</div>;
  if (idx.facility.has(selected)) body = <FacilityView idx={idx} f={idx.facility.get(selected)!} />;
  else if (idx.company.has(selected)) body = <CompanyView idx={idx} c={idx.company.get(selected)!} />;
  else if (idx.flow.has(selected)) body = <FlowView idx={idx} f={idx.flow.get(selected)!} />;
  else if (idx.fin.has(selected)) body = <FinView idx={idx} f={idx.fin.get(selected)!} />;
  else if (idx.control.has(selected)) body = <ControlView idx={idx} c={idx.control.get(selected)!} />;
  else if (selected.startsWith("country:")) body = <CountryView idx={idx} a2={selected.slice(8)} />;
  else if (selected.startsWith("gov:")) body = <GovView idx={idx} id={selected} />;

  return (
    <aside className={`panel inspector${peek ? " peek" : ""}`} key={selected}>
      <button className="sheet-handle" onClick={() => setPeek((p) => !p)} aria-label={peek ? "Expand details" : "Collapse details"} />
      <button className="close" onClick={() => select(null)} aria-label="Close inspector">✕</button>
      {body}
    </aside>
  );
}

// ─── shared bits ───

function Link({ id, idx, children }: { id: string; idx: Index; children?: ReactNode }) {
  const select = useStore((s) => s.select);
  const focus = useStore((s) => s.focus);
  const layer = nodeLayer(idx, id);
  return (
    <button className="link" onClick={() => { select(id); const p = locateAny(idx, id); if (p) focus(p[0], p[1]); }}>
      {layer && <i className="dot" style={{ background: css(LAYER_COLOR[layer]) }} />}
      {children ?? nodeName(idx, id)}
    </button>
  );
}

function Kicker({ layer, children }: { layer?: keyof typeof LAYER_COLOR; children: ReactNode }) {
  return (
    <div className="kicker">
      {layer && <span className="layer-chip" style={{ borderColor: css(LAYER_COLOR[layer], 0.6), color: css(LAYER_COLOR[layer]) }}>{LAYER_CODE[layer]}</span>}
      <span>{children}</span>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="rows">
      {rows.filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="sec">
      <h4>{title}{count !== undefined && <span className="count">{count}</span>}</h4>
      {children}
    </section>
  );
}

function FlowList({ idx, flows, dir }: { idx: Index; flows: Flow[]; dir: "in" | "out" }) {
  const select = useStore((s) => s.select);
  if (!flows.length) return <div className="muted small">None in dataset.</div>;
  return (
    <ul className="flowlist">
      {flows.map((f) => (
        <li key={f.id}>
          <button className="flowrow" onClick={() => select(f.id)}>
            <span className={`basis b-${f.basis}`} title={f.basis}>{f.basis === "documented" ? "DOC" : "INF"}</span>
            <span className="fl-node">{nodeName(idx, dir === "in" ? f.from_node : f.to_node)}</span>
            <span className="fl-comm">{f.commodity}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FinList({ idx, links, self }: { idx: Index; links: FinancialLink[]; self: string }) {
  const select = useStore((s) => s.select);
  if (!links.length) return <div className="muted small">None in dataset.</div>;
  return (
    <ul className="flowlist">
      {[...links].sort((a, b) => (b.amount?.value ?? 0) - (a.amount?.value ?? 0)).map((f) => (
        <li key={f.id}>
          <button className="flowrow" onClick={() => select(f.id)}>
            <span className="basis b-fin">{f.from === self ? "OUT" : "IN"}</span>
            <span className="fl-node">{f.from === f.to ? FIN_LABEL[f.kind] : nodeName(idx, f.from === self ? f.to : f.from)}</span>
            <span className="fl-comm mono">{formatMoney(f.amount)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Actions({ idx, id }: { idx: Index; id: string }) {
  const { trace, severed, set, toggleSever, focus } = useStore();
  const p = locateAny(idx, id);
  return (
    <div className="actions">
      <button className={trace ? "on" : ""} onClick={() => set({ trace: !trace })} title="Highlight everything upstream and downstream of this node">⟷ Trace chain</button>
      <button className={severed.has(id) ? "on danger" : ""} onClick={() => toggleSever(id)} title="What-if: remove this node and show downstream exposure">✂ Sever</button>
      {p && <button onClick={() => focus(p[0], p[1], 3.2)}>◎ Fly to</button>}
      <button onClick={() => { useStore.getState().set({ mode: "network" }); startTour(id, "up"); }} title="Step back through everything that feeds this">▲ Walk upstream</button>
      <button onClick={() => { useStore.getState().set({ mode: "network" }); startTour(id, "down"); }} title="Step forward through everything this feeds">▼ Walk downstream</button>
    </div>
  );
}

function Requirements({ idx, id }: { idx: Index; id: string }) {
  const select = useStore((s) => s.select);
  const needs = (idx.atlas.requirements ?? []).filter((r) => r.node === id);
  const feeds = (idx.atlas.requirements ?? []).filter((r) => r.suppliers.includes(id));
  if (!needs.length && !feeds.length) return null;
  return (
    <Section title="Documented requirements" count={needs.length + feeds.length}>
      {needs.map((r) => (
        <div key={r.id} className="req">
          <div><b>Needs {r.kind}</b> from {r.suppliers.map((x, i) => <span key={x}>{i ? ", " : ""}<button className="link" onClick={() => select(x)}>{nodeName(idx, x)}</button></span>)}
            {r.suppliers.length === 1 && <span className="muted"> (only documented source)</span>} <ReviewBadge review={r.review} note={r.review_note} /></div>
          <p className="desc small">{r.statement}</p>
          <EvidenceList idx={idx} evidence={r.evidence} />
        </div>
      ))}
      {feeds.map((r) => (
        <div key={r.id} className="req">
          <b>Documented supplier of {r.kind}</b> to <button className="link" onClick={() => select(r.node)}>{nodeName(idx, r.node)}</button>
          {r.suppliers.length === 1 && <span className="muted"> (its only documented source)</span>}
        </div>
      ))}
    </Section>
  );
}

function reachLine(idx: Index, id: string) {
  const n = idx.reach.get(id) ?? 0;
  const hits = idx.ko.critical.get(id) ?? [];
  const doc = idx.ko.criticalDoc.get(id) ?? 0;
  return (
    <>
      {n > 0 && <div className="reach"><b className="mono">{n}</b> AI data-center campus{n === 1 ? "" : "es"} in this dataset sit downstream of this node.</div>}
      {hits.length > 0 && <SpofBox idx={idx} hits={hits} doc={doc} />}
    </>
  );
}

function SpofBox({ idx, hits, doc }: { idx: Index; hits: { dc: string; kind: string }[]; doc: number }) {
  const select = useStore((s) => s.select);
  return (
    <div className="reach spof">
      <b>If this went offline:</b> {doc > 0
        ? <><b className="mono">{doc}</b> campus{doc === 1 ? "" : "es"} would have no recorded supplier left for an input, on documented routes{hits.length > doc && <span className="muted"> ({hits.length - doc} more if inferred routes are included)</span>}.</>
        : <span>no campus loses all recorded supply on documented routes. <span className="muted">Through <i>inferred</i> routes only, {hits.length} would, which mostly reflects suppliers the documents don't name.</span></span>}
      <ul>{hits.slice(0, 6).map((h) => <li key={h.dc}><button className="link" onClick={() => select(h.dc)}>{nodeName(idx, h.dc)}</button> <span className="muted">· {h.kind}</span></li>)}</ul>
      {hits.length > 6 && <div className="muted small">+{hits.length - 6} more</div>}
      <div className="muted small">Based on recorded suppliers only. Real alternatives may exist that no document names.</div>
    </div>
  );
}

// ─── entity views ───

function FacilityView({ idx, f }: { idx: Index; f: Facility }) {
  const ups = idx.in.get(f.id) ?? [];
  const downs = idx.out.get(f.id) ?? [];
  const opFlowsIn = (idx.in.get(f.operator) ?? []).filter((x) => !ups.includes(x));
  const opFlowsOut = (idx.out.get(f.operator) ?? []).filter((x) => !downs.includes(x));
  const fin = idx.finByCompany.get(f.operator) ?? [];
  const controls = idx.atlas.controls.filter((c) =>
    c.status !== "rescinded" && c.status !== "superseded" && (c.applies_to.includes(f.country) || c.entities?.includes(f.operator)));
  return (
    <>
      <Kicker layer={f.layer}>{LAYER_LABEL[f.layer]} · {f.kind.replaceAll("_", " ")}</Kicker>
      <h2>{f.name}</h2>
      <div className="badges">
        <ReviewBadge review={f.review} note={f.review_note} />
        <span className={`status s-${f.status}`}>{f.status.replaceAll("_", " ").toUpperCase()}</span>
        <TierBadge tier={f.best_tier} />
      </div>
      {reachLine(idx, f.id)}
      <Rows rows={[
        ["Operator", <Link idx={idx} id={f.operator} />],
        ["Location", <>{f.location.address ?? `${f.location.lat.toFixed(3)}, ${f.location.lon.toFixed(3)}`} <span className="muted">· {f.location.precision} precision</span></>],
        ["Country", f.country],
        ["Since", f.start_year],
        ["Capacity", f.capacity && <>{f.capacity.value.toLocaleString()} {f.capacity.unit} <span className="muted">· as of {f.capacity.as_of}</span></>],
        ["Products", f.products?.length ? f.products.join(", ") : undefined],
      ]} />
      {f.review_note && f.review !== "verified" && <div className="note warn">Counsel: {f.review_note}</div>}
      <Actions idx={idx} id={f.id} />
      <Requirements idx={idx} id={f.id} />
      <Section title="Inbound" count={ups.length + opFlowsIn.length}>
        <FlowList idx={idx} flows={[...ups, ...opFlowsIn]} dir="in" />
      </Section>
      <Section title="Outbound" count={downs.length + opFlowsOut.length}>
        <FlowList idx={idx} flows={[...downs, ...opFlowsOut]} dir="out" />
      </Section>
      {!!controls.length && (
        <Section title="Trade controls touching this site" count={controls.length}>
          <ControlChips idx={idx} controls={controls} />
        </Section>
      )}
      {!!fin.length && <Section title={`Capital · ${nodeName(idx, f.operator)}`} count={fin.length}><FinList idx={idx} links={fin} self={f.operator} /></Section>}
      <Section title="Evidence" count={f.evidence.length + (f.capacity?.evidence.length ?? 0)}>
        <EvidenceList idx={idx} evidence={[...f.evidence, ...(f.capacity?.evidence ?? [])]} />
      </Section>
    </>
  );
}

function CompanyView({ idx, c }: { idx: Index; c: Company }) {
  const facs = idx.facilitiesByOperator.get(c.id) ?? [];
  const fin = idx.finByCompany.get(c.id) ?? [];
  const inflow = idx.in.get(c.id) ?? [];
  const outflow = idx.out.get(c.id) ?? [];
  const controls = idx.atlas.controls.filter((x) => x.entities?.includes(c.id));
  const select = useStore((s) => s.select);
  return (
    <>
      <Kicker layer={c.layers[0]}>Company · {c.country}{c.tickers?.length ? ` · ${c.tickers.join(" · ")}` : ""}</Kicker>
      <h2>{c.name}</h2>
      {reachLine(idx, c.id)}
      <Rows rows={[["Stages", c.layers.map((l) => LAYER_LABEL[l] ?? l).join(" · ")], ["HQ", c.hq.address ?? `${c.hq.lat.toFixed(2)}, ${c.hq.lon.toFixed(2)}`]]} />
      <Actions idx={idx} id={c.id} />
      <Requirements idx={idx} id={c.id} />
      {!!controls.length && <Section title="Named in trade controls" count={controls.length}><ControlChips idx={idx} controls={controls} /></Section>}
      <Section title="Sites" count={facs.length}>
        <ul className="flowlist">
          {facs.map((f) => (
            <li key={f.id}><button className="flowrow" onClick={() => select(f.id)}>
              <i className="dot" style={{ background: css(LAYER_COLOR[f.layer]) }} />
              <span className="fl-node">{f.name}</span><span className="fl-comm">{f.status.replaceAll("_", " ")}</span>
            </button></li>
          ))}
        </ul>
      </Section>
      {!!inflow.length && <Section title="Suppliers (company-level)" count={inflow.length}><FlowList idx={idx} flows={inflow} dir="in" /></Section>}
      {!!outflow.length && <Section title="Customers (company-level)" count={outflow.length}><FlowList idx={idx} flows={outflow} dir="out" /></Section>}
      <Section title="Capital" count={fin.length}><FinList idx={idx} links={fin} self={c.id} /></Section>
      <Section title="Evidence" count={c.evidence.length}><EvidenceList idx={idx} evidence={c.evidence} /></Section>
    </>
  );
}

function FlowView({ idx, f }: { idx: Index; f: Flow }) {
  const [rf, rt] = f.resolution.split("/");
  return (
    <>
      <Kicker layer={f.layer}>Supply route · {f.basis}</Kicker>
      <h2>{f.commodity}</h2>
      <div className="badges"><ReviewBadge review={f.review} note={f.review_note} /><span className={`basis b-${f.basis} big`}>{f.basis.toUpperCase()}</span><TierBadge tier={f.best_tier} /></div>
      <div className="route">
        <Link idx={idx} id={f.from_node} /><span className="arrow">→</span><Link idx={idx} id={f.to_node} />
      </div>
      <p className="desc">{f.description}</p>
      {f.basis === "inferred" && f.inference_note && <div className="note"><b>Inference.</b> {f.inference_note}</div>}
      {(rf === "hq" || rt === "hq" || rf === "operator" || rt === "operator") && (
        <div className="note muted small">
          {rf === "hq" || rt === "hq" ? "One endpoint is drawn at company headquarters because the specific site isn't documented. " : ""}
          {rf === "operator" || rt === "operator" ? "One endpoint was resolved to the company's only site at the adjacent stage; the documents name the company, not the site." : ""}
        </div>
      )}
      {f.volume && <Rows rows={[["Volume", `${f.volume.value.toLocaleString()} ${f.volume.unit} (as of ${f.volume.as_of})`]]} />}
      <Section title="Evidence" count={f.evidence.length}><EvidenceList idx={idx} evidence={f.evidence} /></Section>
    </>
  );
}

function FinView({ idx, f }: { idx: Index; f: FinancialLink }) {
  return (
    <>
      <Kicker layer="finance">{FIN_LABEL[f.kind] ?? f.kind} · {f.date}</Kicker>
      <h2 className="money">{formatMoney(f.amount)}{f.amount?.period && <span className="muted small"> / {f.amount.period}</span>}</h2>
      <div className="badges"><ReviewBadge review={f.review} note={f.review_note} /><TierBadge tier={f.best_tier} /></div>
      <div className="route">
        {f.from.startsWith("gov:") ? <span className="gov">{nodeName(idx, f.from)}</span> : <Link idx={idx} id={f.from} />}
        {f.from !== f.to && <><span className="arrow">→</span>{f.to.startsWith("gov:") ? <span className="gov">{nodeName(idx, f.to)}</span> : <Link idx={idx} id={f.to} />}</>}
      </div>
      <p className="desc">{f.description}</p>
      {f.amount?.note && <div className="note small">{f.amount.note}</div>}
      <Section title="Evidence" count={f.evidence.length}><EvidenceList idx={idx} evidence={f.evidence} /></Section>
    </>
  );
}

function ControlView({ idx, c }: { idx: Index; c: Control }) {
  const select = useStore((s) => s.select);
  const chain = useMemo(() => {
    const prev = idx.atlas.controls.filter((x) => x.superseded_by === c.id);
    const next = c.superseded_by ? idx.control.get(c.superseded_by) : undefined;
    return { prev, next };
  }, [idx, c]);
  return (
    <>
      <Kicker layer="policy">{c.authority} · effective {c.effective_date}</Kicker>
      <h2>{c.instrument}</h2>
      <div className="badges">
        <ReviewBadge review={c.review} note={c.review_note} />
        <span className={`status c-${c.status}`}>{c.status.replaceAll("_", " ").toUpperCase()}</span>
        <span className="mono cite">{c.citation}</span>
        {ctlEffect(c) !== "restrict" && <span>{({ relax: "RELAXES AN EARLIER RULE", import: "IMPORT MEASURE", entities: "NAMED-PARTY LISTING" } as const)[ctlEffect(c) as "relax" | "import" | "entities"]}</span>}
      </div>
      <p className="desc">{c.summary}</p>
      <Rows rows={[
        ["Items", <ul className="items">{c.items.map((i) => <li key={i} className="mono">{i}</li>)}</ul>],
        ["Restricts exports from", c.applies_from.join(", ")],
        ["Destinations", c.applies_to.join(", ")],
        ["Named entities", c.entities?.length ? <div className="chips">{c.entities.map((e) => <Link key={e} idx={idx} id={e} />)}</div> : undefined],
      ]} />
      {(chain.prev.length > 0 || chain.next) && (
        <Section title="Rule history">
          <ul className="flowlist">
            {chain.prev.map((p) => <li key={p.id}><button className="flowrow" onClick={() => select(p.id)}><span className="basis">PREV</span><span className="fl-node">{p.citation}</span><span className="fl-comm">{p.effective_date}</span></button></li>)}
            {chain.next && <li><button className="flowrow" onClick={() => select(chain.next!.id)}><span className="basis">NEXT</span><span className="fl-node">{chain.next.citation}</span><span className="fl-comm">{chain.next.effective_date}</span></button></li>}
          </ul>
        </Section>
      )}
      <Section title="Evidence" count={c.evidence.length}><EvidenceList idx={idx} evidence={c.evidence} /></Section>
    </>
  );
}

function ControlChips({ idx, controls }: { idx: Index; controls: Control[] }) {
  const select = useStore((s) => s.select);
  void idx;
  return (
    <ul className="flowlist">
      {controls.map((c) => (
        <li key={c.id}><button className="flowrow" onClick={() => select(c.id)}>
          <span className="basis b-ctl">{c.authority.split("-")[0]}</span>
          <span className="fl-node">{c.citation}</span><span className="fl-comm">{c.effective_date}</span>
        </button></li>
      ))}
    </ul>
  );
}

function CountryView({ idx, a2 }: { idx: Index; a2: string }) {
  const controlDate = useStore((s) => s.controlDate);
  const { severed, toggleSever } = useStore();
  const active = activeControls(idx, controlDate);
  const inbound = active.filter((c) => c.applies_to.includes(a2));
  const outbound = active.filter((c) => c.applies_from.includes(a2));
  const facs = idx.atlas.facilities.filter((f) => f.country === a2);
  const exposure = useMemo(() => {
    if (!facs.length) return 0;
    const { nodes } = traverse(idx, facs.map((f) => f.id), "down");
    return [...nodes].filter((n) => idx.facility.get(n)?.layer === "datacenter" && idx.facility.get(n)?.country !== a2).length;
  }, [idx, a2, facs]);
  const key = `country:${a2}`;
  return (
    <>
      <Kicker layer="policy">Country · {a2}</Kicker>
      <h2>{a2}</h2>
      <Rows rows={[
        ["Sites in dataset", facs.length],
        ["Downstream DCs abroad", exposure],
        ["Controls targeting", inbound.length],
        ["Controls issued", outbound.length],
      ]} />
      {!!facs.length && <div className="actions"><button className={severed.has(key) ? "on danger" : ""} onClick={() => toggleSever(key)}>✂ Sever all sites in {a2}</button></div>}
      {!!inbound.length && <Section title={`Controls restricting exports to ${a2}`} count={inbound.length}><ControlChips idx={idx} controls={inbound} /></Section>}
      {!!outbound.length && <Section title={`Controls issued by ${a2}`} count={outbound.length}><ControlChips idx={idx} controls={outbound} /></Section>}
    </>
  );
}

function GovView({ idx, id }: { idx: Index; id: string }) {
  const fin = idx.finByCompany.get(id) ?? [];
  const total = fin.reduce((s, f) => s + (f.amount?.currency === "USD" && f.from === id ? f.amount.value : 0), 0);
  return (
    <>
      <Kicker layer="policy">Government</Kicker>
      <h2>{nodeName(idx, id)}</h2>
      <Rows rows={[["Documented USD outflows", formatMoney({ value: total, currency: "USD" })]]} />
      <Section title="Capital" count={fin.length}><FinList idx={idx} links={fin} self={id} /></Section>
    </>
  );
}
