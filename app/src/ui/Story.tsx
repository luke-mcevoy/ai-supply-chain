import { useEffect, useMemo } from "react";
import { STORIES, type Story } from "../stories";
import { type Index, nodeName } from "../atlas";
import { DOC_LABEL } from "../theme";
import { useStore } from "../store";
import { TierBadge } from "./Evidence";

export function useStory(): { story: Story; step: number } | null {
  const st = useStore((s) => s.story);
  return useMemo(() => {
    const story = st && STORIES.find((x) => x.id === st.id);
    return story ? { story, step: st!.step } : null;
  }, [st]);
}

/** Nodes and routes to highlight for the current story step. */
export function useStoryFocus(idx: Index) {
  const cur = useStory();
  return useMemo(() => {
    const step = cur?.story.steps[cur.step];
    if (!step) return null;
    const nodes = new Set<string>(), flows = new Set<string>(), frame: string[] = [];
    for (const id of step.focus) {
      const f = idx.flow.get(id);
      const fin = idx.fin.get(id);
      if (f) { flows.add(id); nodes.add(f.from_node); nodes.add(f.to_node); frame.push(f.from_node, f.to_node); }
      else if (fin) { nodes.add(fin.from); nodes.add(fin.to); frame.push(fin.to); }
      else if (idx.facility.has(id) || idx.company.has(id)) { nodes.add(id); frame.push(id); }
    }
    return { nodes, flows, stepNodes: new Set(frame), controls: step.focus.filter((id) => idx.control.has(id)) };
  }, [cur, idx]);
}

export function startStory(id: string) {
  useStore.getState().set({ story: { id, step: 0 }, tour: null, trace: false, storyPicker: false,
    railOpen: window.innerWidth > 900 ? useStore.getState().railOpen : false });
}

export function StoryPicker() {
  const { storyPicker, set } = useStore();
  if (!storyPicker) return null;
  return (
    <div className="scrim" onClick={() => set({ storyPicker: false })}>
      <div className="story-picker" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={() => set({ storyPicker: false })} aria-label="Close">✕</button>
        <h1>Stories</h1>
        <p className="muted">Guided walks through the atlas. Every claim on screen is a verbatim quote from a verified document. The captions only connect them.</p>
        <ul>
          {STORIES.map((s) => (
            <li key={s.id}>
              <button onClick={() => startStory(s.id)}>
                <b>{s.title}</b>
                <span>{s.dek}</span>
                <span className="mono muted small">{s.steps.length} steps →</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function StoryPanel({ idx }: { idx: Index }) {
  const cur = useStory();
  const set = useStore((s) => s.set);
  const select = useStore((s) => s.select);
  const step = cur?.story.steps[cur.step];

  // Apply the step: view mode, inspector selection, and for trade rules the timeline date and bloc.
  useEffect(() => {
    if (!step) return;
    const patch: Record<string, unknown> = { mode: step.mode };
    if (step.date) patch.controlDate = step.date === "today" ? Date.now() : Date.parse(step.date);
    if (step.bloc) patch.ctlBloc = step.bloc;
    set(patch);
    if (step.select && (idx.facility.has(step.select) || idx.flow.has(step.select) || idx.fin.has(step.select) || idx.control.has(step.select) || idx.company.has(step.select))) select(step.select);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cur) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (e.key === "ArrowRight") go(cur.step + 1);
      if (e.key === "ArrowLeft") go(cur.step - 1);
      if (e.key === "Escape") set({ story: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!cur || !step) return null;
  const { story } = cur;
  function go(i: number) { set({ story: { id: story.id, step: Math.max(0, Math.min(story.steps.length - 1, i)) } }); }

  return (
    <div className="panel tour story" role="region" aria-label={`Story: ${story.title}`}>
      <div className="tour-head">
        <span className="tour-kicker">Story</span>
        <b className="story-title">{story.title}</b>
        <button className="linkish" onClick={() => set({ storyPicker: true })}>All stories</button>
        <button className="close" onClick={() => set({ story: null })} aria-label="End story">✕</button>
      </div>
      <ol className="tour-steps">
        {story.steps.map((s, i) => (
          <li key={i} className={i === cur.step ? "on" : i < cur.step ? "done" : ""}>
            <button onClick={() => go(i)} title={s.title}><i style={{ background: "var(--accent)" }} /><span>{s.title}</span></button>
          </li>
        ))}
      </ol>
      <div className="tour-body">
        <div className="tour-title">
          <span className="mono muted">{String(cur.step + 1).padStart(2, "0")}/{String(story.steps.length).padStart(2, "0")}</span>
          <h3>{step.title}</h3>
        </div>
        <p className="story-caption">{step.caption}</p>
        {step.quotes.map((q, i) => {
          const e = idx.facility.get(q.entity) ?? idx.flow.get(q.entity) ?? idx.fin.get(q.entity) ?? idx.control.get(q.entity) ?? idx.company.get(q.entity);
          const ev = e?.evidence[q.ev];
          const src = ev && idx.source.get(ev.source);
          if (!ev || !src) return null;
          return (
            <figure key={i} className="story-quote">
              <blockquote>“{ev.quote}”</blockquote>
              <figcaption>
                <TierBadge tier={src.tier} /> <a href={src.url} target="_blank" rel="noreferrer noopener">{DOC_LABEL[src.doc_type] ?? src.doc_type} · {src.publisher}</a>
                <span className="muted"> · {src.document_date} · on </span>
                <button className="link" onClick={() => select(q.entity)}>{idx.control.get(q.entity)?.citation ?? (nodeName(idx, q.entity) !== q.entity ? nodeName(idx, q.entity) : "this item")}</button>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div className="tour-nav">
        <button onClick={() => go(cur.step - 1)} disabled={cur.step === 0}>← Prev</button>
        <span className="muted small hide-sm">← → keys</span>
        {cur.step < story.steps.length - 1
          ? <button className="primary" onClick={() => go(cur.step + 1)}>Next →</button>
          : <button className="primary" onClick={() => set({ story: null, storyPicker: true })}>More stories</button>}
      </div>
    </div>
  );
}
