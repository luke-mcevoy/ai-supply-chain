import { useEffect, useMemo } from "react";
import { buildTour, stepFlows, traverse, nodeName, TOUR_ORDER, type Index, type Tour as TourT } from "../atlas";
import { LAYER_COLOR, LAYER_LABEL, css } from "../theme";
import { useStore } from "../store";

/** The active walk (or null), memoised on anchor + direction. */
export function useTour(idx: Index): TourT | null {
  const t = useStore((s) => s.tour);
  return useMemo(() => (t ? buildTour(idx, t.anchor, t.dir) : null), [idx, t?.anchor, t?.dir]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Nodes + routes to highlight for the current step: the stage's sites, their routes, and the sites at the far ends. */
export function useTourFocus(idx: Index) {
  const tour = useTour(idx);
  const step = useStore((s) => s.tour?.step ?? 0);
  return useMemo(() => {
    const st = tour?.steps[step];
    if (!tour || !st) return null;
    const flows = stepFlows(idx, tour, st);
    const nodes = new Set(st.nodes);
    for (const f of flows) { nodes.add(f.from_node); nodes.add(f.to_node); }
    return { nodes, flows: new Set(flows.map((f) => f.id)), stepNodes: new Set(st.nodes) };
  }, [idx, tour, step]);
}

/** Good default anchors: the AI campus with the deepest documented upstream, and the raw-material site with the widest reach. */
export function defaultAnchors(idx: Index) {
  const dcs = idx.atlas.facilities.filter((f) => f.layer === "datacenter" && f.status !== "cancelled");
  const campus = dcs.map((f) => ({ id: f.id, n: traverse(idx, [f.id], "up").nodes.size }))
    .sort((a, b) => b.n - a.n)[0]?.id;
  const mine = idx.atlas.facilities.filter((f) => f.layer === "materials")
    .sort((a, b) => (idx.reach.get(b.id) ?? 0) - (idx.reach.get(a.id) ?? 0))[0]?.id;
  return { campus, mine };
}

export function startTour(anchor: string, dir: "up" | "down") {
  useStore.getState().set({ tour: { anchor, dir, step: 0 }, story: null, trace: false, railOpen: window.innerWidth > 900 ? useStore.getState().railOpen : false });
}

export default function TourPanel({ idx }: { idx: Index }) {
  const tourState = useStore((s) => s.tour);
  const set = useStore((s) => s.set);
  const select = useStore((s) => s.select);
  const tour = useTour(idx);
  const step = tourState?.step ?? 0;
  const st = tour?.steps[step];

  const go = (i: number) => tour && set({ tour: { ...tourState!, step: Math.max(0, Math.min(tour.steps.length - 1, i)) } });

  useEffect(() => {
    if (!tourState) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
      if (e.key === "Escape") set({ tour: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Anchors to switch between: campuses when walking upstream, raw-material sites when walking downstream.
  const anchors = useMemo(() => {
    const layer = tourState?.dir === "down" ? "materials" : "datacenter";
    return idx.atlas.facilities.filter((f) => f.layer === layer && f.status !== "cancelled").sort((a, b) => a.name.localeCompare(b.name));
  }, [idx, tourState?.dir]);

  if (!tourState || !tour) return null;
  if (!st) {
    return (
      <div className="panel tour">
        <div className="tour-head"><b>Nothing to walk</b><button className="close" onClick={() => set({ tour: null })}>✕</button></div>
        <p className="muted small">No recorded routes lead {tourState.dir === "up" ? "into" : "out of"} {nodeName(idx, tourState.anchor)}.</p>
      </div>
    );
  }

  const flows = stepFlows(idx, tour, st);
  const onward = flows.filter((f) => (tour.dir === "down" ? st.nodes.includes(f.from_node) : st.nodes.includes(f.to_node)));
  // Group by the stage at the other end: "Supplied by — Power: electricity · Servers & racks: HGX servers"
  const groups = new Map<string, Map<string, number>>();
  for (const f of onward) {
    const other = tour.dir === "down" ? f.to_node : f.from_node;
    const l = idx.facility.get(other)?.layer ?? idx.company.get(other)?.layers?.[0] ?? "other";
    const g = groups.get(l) ?? new Map<string, number>();
    g.set(f.commodity, (g.get(f.commodity) ?? 0) + 1);
    groups.set(l, g);
  }
  const grouped = [...groups].sort((a, b) => TOUR_ORDER.indexOf(a[0] as never) - TOUR_ORDER.indexOf(b[0] as never));
  const doc = onward.filter((f) => f.basis === "documented").length;
  const next = tour.steps[step + 1];
  const reverse = () => {
    // Flip direction, anchoring at the far end of this walk.
    const pool = tour.steps.at(-1)?.nodes ?? [];
    const far = pool[0];
    if (far) startTour(far, tour.dir === "up" ? "down" : "up");
  };

  return (
    <div className="panel tour" role="region" aria-label="Chain walk">
      <div className="tour-head">
        <span className="tour-kicker">
          {tour.dir === "up" ? "Upstream from" : "Downstream from"}
        </span>
        <select value={tourState.anchor} onChange={(e) => startTour(e.target.value, tourState.dir)} aria-label="Walk anchor">
          {!anchors.some((a) => a.id === tourState.anchor) && <option value={tourState.anchor}>{nodeName(idx, tourState.anchor)}</option>}
          {anchors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <button className="linkish" onClick={reverse} title="Walk the other way">⇄ Reverse</button>
        <button className="close" onClick={() => set({ tour: null })} aria-label="End walk">✕</button>
      </div>

      <ol className="tour-steps">
        {tour.steps.map((s, i) => (
          <li key={s.layer} className={i === step ? "on" : i < step ? "done" : ""}>
            <button onClick={() => go(i)} title={LAYER_LABEL[s.layer]}>
              <i style={{ background: css(LAYER_COLOR[s.layer]) }} />
              <span>{LAYER_LABEL[s.layer]}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="tour-body">
        <div className="tour-title">
          <span className="mono muted">{String(step + 1).padStart(2, "0")}/{String(tour.steps.length).padStart(2, "0")}</span>
          <h3 style={{ color: css(LAYER_COLOR[st.layer]) }}>{LAYER_LABEL[st.layer]}</h3>
          <span className="muted small">{st.nodes.length} site{st.nodes.length === 1 ? "" : "s"} on this path</span>
        </div>
        <div className="tour-sites">
          {st.nodes.slice(0, 8).map((n) => (
            <button key={n} className="chip" onClick={() => select(n)}>{nodeName(idx, n)}</button>
          ))}
          {st.nodes.length > 8 && <span className="muted small">+{st.nodes.length - 8} more</span>}
        </div>
        {onward.length > 0 && (
          <div className="tour-onward small">
            <span className="muted">{tour.dir === "down" ? "Feeds" : "Supplied by"} · {doc} documented, {onward.length - doc} inferred routes</span>
            {grouped.map(([l, g]) => (
              <div key={l}>
                <b style={{ color: css(LAYER_COLOR[l as keyof typeof LAYER_COLOR] ?? [180, 180, 180]) }}>{LAYER_LABEL[l as keyof typeof LAYER_LABEL] ?? "Company-level"}</b>{": "}
                {[...g].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${c}${n > 1 ? ` ×${n}` : ""}`).join(" · ")}
              </div>
            ))}
          </div>
        )}
        {!next && <div className="tour-onward small muted">End of the recorded chain in this direction. Use ⇄ Reverse to walk back.</div>}
      </div>

      <div className="tour-nav">
        <button onClick={() => go(step - 1)} disabled={step === 0}>← Prev</button>
        <span className="muted small hide-sm">← → keys</span>
        <button className="primary" onClick={() => go(step + 1)} disabled={step >= tour.steps.length - 1}>Next →</button>
      </div>
    </div>
  );
}

export { TOUR_ORDER };
