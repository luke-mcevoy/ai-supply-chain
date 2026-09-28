#!/usr/bin/env node
// Merge data/research/*.json + data/verification/*.json → data/build/atlas.json (+ app/public/atlas.json).
//
// Publication policy:
//   - an entity is published only if its layer's verification file gives it
//     verdict "publish" or "publish_flagged";
//   - evidence items whose check failed are dropped; an entity left with no
//     verified evidence is withheld even if the verdict said publish;
//   - `--draft` publishes unverified layers too, every entity marked
//     review:"unverified" (for local development only — never deploy a draft build).
//
// Cross-layer flow endpoints given as company ids are resolved through
// from_hint/to_hint, else to the company's facility in the most plausible layer, else to its HQ.

import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRAFT = process.argv.includes("--draft");
const ORDER = ["materials", "wafers_chemicals", "equipment", "fabrication", "memory_packaging",
  "design", "systems", "datacenter", "power"];
const PASS = new Set(["verified", "verified_with_correction"]);

const readDir = (d) => existsSync(d) ? readdirSync(d).filter((n) => n.endsWith(".json")) : [];
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const research = Object.fromEntries(readDir(join(ROOT, "data/research"))
  .map((n) => [n.replace(".json", ""), readJson(join(ROOT, "data/research", n))]));
const verification = Object.fromEntries(readDir(join(ROOT, "data/verification"))
  .map((n) => [n.replace(".json", ""), readJson(join(ROOT, "data/verification", n))]));

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] ??= {};
  o[keys.at(-1)] = value;
}

const sources = new Map();
const companies = new Map();
const facilities = new Map();
const flows = new Map();
const financial = new Map();
const controls = new Map();
const gaps = [];
const stats = { layers: {}, withheld: 0, droppedEvidence: 0 };

for (const [layer, file] of Object.entries(research)) {
  const v = verification[layer];
  if (!v && !DRAFT) { stats.layers[layer] = "skipped (not yet verified)"; continue; }

  const verdicts = new Map((v?.entity_verdicts ?? []).map((e) => [e.entity, e]));
  const failed = new Set((v?.evidence_checks ?? []).filter((c) => !PASS.has(c.verdict))
    .map((c) => `${c.entity}#${c.evidence_index}`));
  const srcTier = new Map((v?.source_checks ?? []).map((s) => [s.source, s.tier_assigned]));

  for (const s of file.sources) {
    const tier = srcTier.get(s.id) ?? s.tier;
    if (!sources.has(s.id)) sources.set(s.id, { ...s, tier, layer });
  }

  let published = 0;
  const admit = (e, kind) => {
    const verdict = verdicts.get(e.id);
    let review;
    if (v) {
      if (!verdict || verdict.verdict === "reject") { stats.withheld++; return null; }
      review = verdict.verdict === "publish" ? "verified" : "flagged";
    } else review = "unverified";

    const out = structuredClone(e);
    for (const [path, val] of Object.entries(verdict?.corrections ?? {})) setPath(out, path, val);
    const before = out.evidence.length;
    out.evidence = out.evidence.filter((_, i) => !failed.has(`${e.id}#${i}`));
    stats.droppedEvidence += before - out.evidence.length;
    if (v && out.evidence.length === 0) { stats.withheld++; return null; }

    out.review = review;
    if (verdict?.reasons) out.review_note = verdict.reasons;
    out.best_tier = Math.min(...out.evidence.map((ev) => sources.get(ev.source)?.tier ?? 3));
    out.layer ??= layer;
    out.source_layer = layer;
    published++;
    return out;
  };

  for (const c of file.companies) {
    // Companies appear in many files; merge evidence and layers rather than admit/reject per file.
    const prev = companies.get(c.id);
    const verdict = verdicts.get(c.id);
    if (v && verdict?.verdict === "reject") continue;
    const ev = c.evidence.filter((_, i) => !failed.has(`${c.id}#${i}`));
    if (prev) {
      prev.layers = [...new Set([...prev.layers, ...(c.layers ?? [])])];
      prev.evidence.push(...ev);
    } else companies.set(c.id, { ...c, evidence: ev, layers: [...(c.layers ?? [])] });
  }
  // The same id may be researched in two layers (e.g. a supplier's filing and the customer's filing
  // for one route). Each copy is verified by its own layer's counsel; the published entity keeps the
  // first copy's fields and the union of both copies' surviving evidence.
  const put = (map, o) => {
    const prev = map.get(o.id);
    if (!prev) { map.set(o.id, o); return; }
    prev.evidence.push(...o.evidence);
    prev.best_tier = Math.min(prev.best_tier, o.best_tier);
    if (prev.review !== o.review && (prev.review === "verified" || o.review === "verified")) prev.review = "verified";
  };
  for (const f of file.facilities) { const o = admit(f, "facility"); if (o) put(facilities, o); }
  for (const f of file.flows) { const o = admit(f, "flow"); if (o) put(flows, o); }
  for (const f of file.financial_links) { const o = admit(f, "fin"); if (o) put(financial, o); }
  for (const f of file.controls) { const o = admit(f, "ctl"); if (o) put(controls, o); }
  for (const g of file.gaps ?? []) gaps.push({ ...g, layer });
  stats.layers[layer] = `${published} published (${v ? "verified" : "DRAFT"})`;
}

// ── Endpoint resolution ──
const byOperator = new Map();
for (const f of facilities.values()) {
  if (!byOperator.has(f.operator)) byOperator.set(f.operator, []);
  byOperator.get(f.operator).push(f);
}
const layerIdx = (l) => ORDER.indexOf(l);

function resolve(endpoint, hint, otherLayer, side) {
  if (facilities.has(endpoint)) return { id: endpoint, how: "direct" };
  if (hint && facilities.has(hint)) return { id: hint, how: "hint" };
  const facs = byOperator.get(endpoint) ?? [];
  if (facs.length) {
    // Upstream side looks for the operator's site in the stage just before the other end; downstream, just after.
    // Only resolve when that choice is UNAMBIGUOUS (one candidate in the closest stage). Picking one of several
    // fabs would put an undocumented site on the map, so ambiguous cases fall back to the company HQ.
    const target = layerIdx(otherLayer) + (side === "from" ? -1 : 1);
    const dist = (f) => Math.abs(layerIdx(f.layer) - target);
    const best = Math.min(...facs.map(dist));
    const candidates = facs.filter((f) => dist(f) === best && f.status !== "cancelled");
    if (candidates.length === 1) return { id: candidates[0].id, how: "operator" };
  }
  if (companies.has(endpoint)) return { id: endpoint, how: "hq" };
  return null;
}

const locOf = (id) => facilities.get(id)?.location ?? companies.get(id)?.hq;
const layerOfEnd = (id) => facilities.get(id)?.layer ?? companies.get(id)?.layers?.[0];

let unresolved = 0;
for (const fl of flows.values()) {
  const toGuess = facilities.get(fl.to)?.layer ?? facilities.get(fl.to_hint)?.layer ?? fl.source_layer;
  const fromGuess = facilities.get(fl.from)?.layer ?? facilities.get(fl.from_hint)?.layer ?? fl.source_layer;
  const a = resolve(fl.from, fl.from_hint, toGuess, "from");
  const b = resolve(fl.to, fl.to_hint, fromGuess, "to");
  if (!a || !b || !locOf(a.id) || !locOf(b.id)) { flows.delete(fl.id); unresolved++; continue; }
  fl.from_node = a.id; fl.to_node = b.id;
  fl.resolution = `${a.how}/${b.how}`;
  fl.layer = fl.source_layer;
  fl.from_layer = layerOfEnd(a.id);
}

// Publish only the sources that back something on the map (published evidence or company records).
const cited = new Set();
for (const coll of [companies, facilities, flows, financial, controls])
  for (const e of coll.values()) for (const ev of [...e.evidence, ...(e.capacity?.evidence ?? [])]) cited.add(ev.source);
for (const id of [...sources.keys()]) if (!cited.has(id)) sources.delete(id);

const atlas = {
  built_at: new Date().toISOString(),
  draft: DRAFT,
  stats: {
    ...stats, unresolvedFlows: unresolved,
    counts: {
      sources: sources.size, companies: companies.size, facilities: facilities.size,
      flows: flows.size, financial_links: financial.size, controls: controls.size, gaps: gaps.length,
    },
  },
  sources: [...sources.values()],
  companies: [...companies.values()],
  facilities: [...facilities.values()],
  flows: [...flows.values()],
  financial_links: [...financial.values()],
  controls: [...controls.values()],
  gaps,
};

mkdirSync(join(ROOT, "data/build"), { recursive: true });
const out = JSON.stringify(atlas);
writeFileSync(join(ROOT, "data/build/atlas.json"), JSON.stringify(atlas, null, 1));
if (existsSync(join(ROOT, "app"))) {
  mkdirSync(join(ROOT, "app/public"), { recursive: true });
  writeFileSync(join(ROOT, "app/public/atlas.json"), out);
}
console.log(JSON.stringify(atlas.stats, null, 2));
