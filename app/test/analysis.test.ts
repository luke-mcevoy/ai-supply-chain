import { describe, expect, test } from "vitest";
import { buildIndex, traverse, buildTour, inputKind, ctlEffect, cutOff, type Control } from "../src/atlas";
import { atlas, co, fac, flow } from "./fixture";

describe("inputKind", () => {
  test.each([
    ["EUV lithography systems", "lithography"], ["300 mm silicon wafers", "silicon wafers"],
    ["HBM3E 36GB 12-high", "memory"], ["leading-edge logic wafers (GPU dies)", "logic dies"],
    ["CoWoS advanced packaging", "packaging"], ["electricity (natural gas CCCT)", "electricity"],
    ["NVIDIA GB200 NVL72 racks", "AI compute hardware"], ["Spectrum-X Ethernet switches", "networking"],
    ["ultra-high-purity atmospheric, process and specialty gases", "industrial gases"],
  ])("%s → %s", (c, k) => expect(inputKind(c)).toBe(k));
});

describe("knockout (single points of failure)", () => {
  const base = () => ({
    companies: [co("co:a"), co("co:b"), co("co:c")],
    facilities: [fac("fac:gpu1", "co:a", "design"), fac("fac:gpu2", "co:b", "design"), fac("fac:grid", "co:c", "power"),
      fac("fac:dc", "co:c", "datacenter")],
  });
  test("sole supplier of an input is a single point of failure", () => {
    const idx = buildIndex(atlas({ ...base(), flows: [flow("fac:gpu1", "fac:dc", "NVIDIA GPUs"), flow("fac:grid", "fac:dc", "electricity")] }));
    expect(idx.ko.critical.get("fac:gpu1")?.map((h) => h.dc)).toEqual(["fac:dc"]);
    expect(idx.ko.critical.get("fac:grid")?.[0].kind).toBe("electricity");
  });
  test("two suppliers of the same input are substitutes", () => {
    const idx = buildIndex(atlas({ ...base(), flows: [flow("fac:gpu1", "fac:dc", "GPUs"), flow("fac:gpu2", "fac:dc", "GPUs")] }));
    expect(idx.ko.critical.has("fac:gpu1")).toBe(false);
    expect(cutOff(idx, ["fac:gpu1", "fac:gpu2"]).map((h) => h.dc)).toEqual(["fac:dc"]);
  });
  test("failures propagate across stages (AND across input kinds)", () => {
    const b = base();
    b.facilities.push(fac("fac:litho", "co:b", "equipment"));
    const idx = buildIndex(atlas({ ...b, flows: [flow("fac:litho", "fac:gpu1", "EUV lithography systems"), flow("fac:gpu1", "fac:dc", "GPUs")] }));
    expect(idx.ko.critical.get("fac:litho")?.[0]).toEqual({ dc: "fac:dc", kind: "AI compute hardware" });
  });
  test("an inferred route cannot add a new requirement to a documented node", () => {
    const b = base();
    b.facilities.push(fac("fac:optics", "co:b", "systems"));
    const idx = buildIndex(atlas({ ...b, flows: [
      flow("fac:gpu1", "fac:dc", "GPUs"), flow("fac:optics", "fac:gpu1", "optical transceivers for networking", "inferred"),
      flow("fac:grid", "fac:gpu1", "electricity")] }));
    expect(idx.ko.critical.has("fac:optics")).toBe(false);
    expect(idx.ko.critical.has("fac:grid")).toBe(true);
  });
  test("a company-level supplier depends only on its sites that make that input", () => {
    // co:t supplies logic dies at company level; its packaging site must not keep that supply alive.
    const idx = buildIndex(atlas({
      companies: [co("co:t", ["fabrication"]), co("co:e", ["equipment"]), co("co:c")],
      facilities: [fac("fac:fab", "co:t", "fabrication"), fac("fac:pkg", "co:t", "memory_packaging"),
        fac("fac:tool", "co:e", "equipment"), fac("fac:dc", "co:c", "datacenter")],
      flows: [flow("fac:tool", "fac:fab", "EUV lithography systems"), flow("co:t", "fac:dc", "logic wafers (GPU dies)")],
    }));
    expect(idx.ko.critical.get("fac:tool")?.map((h) => h.dc)).toEqual(["fac:dc"]);
  });
});

describe("traverse", () => {
  test("a site reaches its own company's later stages, not its peers", () => {
    const idx = buildIndex(atlas({
      companies: [co("co:t", ["fabrication"])],
      facilities: [fac("fac:fab1", "co:t", "fabrication"), fac("fac:fab2", "co:t", "fabrication"), fac("fac:pkg", "co:t", "memory_packaging")],
    }));
    const { nodes } = traverse(idx, ["fac:fab1"], "down");
    expect(nodes.has("fac:pkg")).toBe(true);
    expect(nodes.has("fac:fab2")).toBe(false);
  });
  test("walk steps come out in chain order", () => {
    const idx = buildIndex(atlas({
      companies: [co("co:a")],
      facilities: [fac("fac:m", "co:a", "materials"), fac("fac:w", "co:a", "wafers_chemicals"), fac("fac:dc", "co:a", "datacenter")],
      flows: [flow("fac:m", "fac:w", "polysilicon"), flow("fac:w", "fac:dc", "GPUs")],
    }));
    expect(buildTour(idx, "fac:dc", "up").steps.map((s) => s.layer)).toEqual(["datacenter", "wafers_chemicals", "materials"]);
    expect(buildTour(idx, "fac:m", "down").steps.map((s) => s.layer)).toEqual(["materials", "wafers_chemicals", "datacenter"]);
  });
});

describe("ctlEffect", () => {
  const c = (p: Partial<Control>) => ({ id: "ctl:x", authority: "US-BIS", instrument: "rule", citation: "", effective_date: "2025-01-01",
    status: "in_force", items: [], applies_from: ["US"], applies_to: ["CN"], summary: "", evidence: [], review: "verified", best_tier: 1, ...p }) as Control;
  test("export control restricts", () => expect(ctlEffect(c({}))).toBe("restrict"));
  test("suspension relaxes", () => expect(ctlEffect(c({ id: "ctl:cn-mofcom-2025-72-suspension", authority: "CN-MOFCOM" }))).toBe("relax"));
  test("section 232 is an import measure", () => expect(ctlEffect(c({ authority: "US-President", applies_from: ["*all origins (import measure)"], applies_to: ["US"] }))).toBe("import"));
  test("entity listing marks parties, not countries", () => expect(ctlEffect(c({ id: "ctl:us-bis-2025-09-entity-list-x", instrument: "Additions to the Entity List" }))).toBe("entities"));
});

describe("documented requirements", () => {
  test("a sole documented supplier becomes a single point of failure", () => {
    const idx = buildIndex({
      ...atlas({
        companies: [co("co:a", ["equipment"]), co("co:t", ["fabrication"]), co("co:c")],
        facilities: [fac("fac:tool", "co:a", "equipment"), fac("fac:fab", "co:t", "fabrication"), fac("fac:dc", "co:c", "datacenter")],
        flows: [flow("fac:fab", "fac:dc", "logic wafers (GPU dies)")],
      }),
      requirements: [{ id: "req:x", node: "fac:fab", kind: "lithography", suppliers: ["co:a"], statement: "", evidence: [], review: "verified", best_tier: 1 }],
    });
    expect(idx.ko.critical.get("co:a")?.map((h) => h.dc)).toEqual(["fac:dc"]);
    expect(idx.ko.critical.get("fac:tool")?.map((h) => h.dc)).toEqual(["fac:dc"]); // the company's only equipment site
  });
});
