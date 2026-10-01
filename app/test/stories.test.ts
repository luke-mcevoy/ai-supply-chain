// Stories must stay grounded in the published, verified atlas.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildIndex, type Atlas } from "../src/atlas";
import { STORIES } from "../src/stories";

const idx = buildIndex(JSON.parse(readFileSync(new URL("../public/atlas.json", import.meta.url), "utf8")) as Atlas);
const entity = (id: string) => idx.facility.get(id) ?? idx.flow.get(id) ?? idx.fin.get(id) ?? idx.control.get(id) ?? idx.company.get(id);

describe.each(STORIES.map((s) => [s.id, s] as const))("story %s", (_, story) => {
  test.each(story.steps.map((st, i) => [i + 1, st] as const))("step %i is grounded", (_, st) => {
    for (const id of st.focus) expect(entity(id), `focus ${id}`).toBeTruthy();
    if (st.select) expect(entity(st.select), `select ${st.select}`).toBeTruthy();
    expect(st.quotes.length).toBeGreaterThan(0);
    const quoteText: string[] = [];
    for (const q of st.quotes) {
      const ev = entity(q.entity)?.evidence[q.ev];
      expect(ev, `quote ${q.entity}#${q.ev}`).toBeTruthy();
      expect(idx.source.has(ev!.source)).toBe(true);
      quoteText.push(ev!.quote);
    }
    // Any number in the caption must appear in this step's quotes or the shown items' own names/dates.
    const own = st.focus.map((id) => { const e = entity(id) as unknown as Record<string, unknown>; return [e?.name, e?.commodity, e?.effective_date, e?.date, e?.citation].join(" "); });
    const allowed = [...quoteText, ...own].join(" ").replace(/,/g, "");
    for (const n of st.caption.match(/\d+(?:[.,]\d+)*/g) ?? []) expect(allowed, `caption number ${n} in "${st.title}"`).toContain(n.replace(/,/g, ""));
  });
});
