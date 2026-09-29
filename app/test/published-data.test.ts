// Integrity checks on the atlas that is actually deployed.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { buildIndex, locateAny, type Atlas } from "../src/atlas";

const atlas = JSON.parse(readFileSync(new URL("../public/atlas.json", import.meta.url), "utf8")) as Atlas;
const idx = buildIndex(atlas);

describe("published atlas", () => {
  test("is a verified build, never a draft", () => expect(atlas.draft).toBe(false));
  test("every published entity is reviewed and has evidence from a published source", () => {
    for (const e of [...atlas.facilities, ...atlas.flows, ...atlas.financial_links, ...atlas.controls]) {
      expect(["verified", "flagged"], e.id).toContain(e.review);
      expect(e.evidence.length, e.id).toBeGreaterThan(0);
      for (const ev of e.evidence) expect(idx.source.has(ev.source), `${e.id} cites ${ev.source}`).toBe(true);
    }
  });
  test("every quote is non-trivial", () => {
    for (const e of [...atlas.facilities, ...atlas.flows, ...atlas.financial_links, ...atlas.controls])
      for (const ev of e.evidence) expect(ev.quote.length, e.id).toBeGreaterThanOrEqual(8);
  });
  test("every source is cited and has a URL", () => {
    for (const s of atlas.sources) expect(/^https?:\/\//.test(s.url), s.id).toBe(true);
  });
  test("every route has two locatable ends", () => {
    for (const f of atlas.flows) {
      expect(locateAny(idx, f.from_node), f.id).toBeTruthy();
      expect(locateAny(idx, f.to_node), f.id).toBeTruthy();
    }
  });
  test("no route is drawn from a site its own evidence doesn't support (regression: NVIDIA→Israel)", () => {
    const bad = atlas.flows.filter((f) => f.from_node === "fac:nvidia-israel-networking" && !/israel|mellanox|networking/i.test(f.commodity + f.description));
    expect(bad.map((f) => f.id)).toEqual([]);
  });
  test("coordinates are on the globe", () => {
    for (const f of atlas.facilities) {
      expect(Math.abs(f.location.lat), f.id).toBeLessThanOrEqual(90);
      expect(Math.abs(f.location.lon), f.id).toBeLessThanOrEqual(180);
    }
  });
});
