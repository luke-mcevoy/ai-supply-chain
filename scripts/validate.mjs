#!/usr/bin/env node
// Structural + referential validation of data/research/*.json and data/verification/*.json.
// Usage: node scripts/validate.mjs [layer ...]   (no args = all files)
// Exits non-zero on errors. Warnings do not fail.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESEARCH = join(ROOT, "data/research");
const VERIFY = join(ROOT, "data/verification");

const LAYERS = ["materials", "wafers_chemicals", "equipment", "fabrication", "memory_packaging",
  "design", "systems", "datacenter", "power", "policy", "finance", "linkage"];
const INPUT_KINDS = ["contract manufacturing", "electricity", "generation equipment", "networking", "lithography",
  "process tools", "memory", "logic dies", "packaging", "polysilicon", "rare earths", "germanium feedstock", "fluorspar",
  "photoresist", "industrial gases", "chemicals & materials", "silicon wafers", "AI compute hardware", "IP & EDA"];
const TIER_OF = {
  sec_10k: 1, sec_20f: 1, sec_10q: 1, sec_8k: 1, sec_6k: 1, sec_s1: 1, sec_def14a: 1,
  foreign_annual_report: 1, federal_register: 1, cfr: 1, bis_entity_list: 1, legislation: 1,
  gov_award: 1, gov_contract: 1, gov_press_release: 1, gov_report: 1, regulatory_filing: 1, court_filing: 1,
  earnings_call: 2, investor_presentation: 2, company_press_release: 2, company_website: 2,
  news: 3, other: 3,
};
const FAC_STATUS = ["operational", "under_construction", "announced", "planned", "paused", "cancelled"];
const FIN_KINDS = ["revenue_concentration", "purchase_commitment", "prepayment", "equity_investment",
  "acquisition", "joint_venture", "government_grant", "government_loan", "tax_credit", "debt_financing",
  "lease_commitment", "cloud_contract", "ppa", "capex", "compute_for_equity"];
const CTL_STATUS = ["in_force", "amended", "superseded", "rescinded", "proposed"];
const VERDICTS = ["verified", "verified_with_correction", "quote_not_found", "does_not_support",
  "superseded", "insufficient_tier", "unreachable"];
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const errors = [];
const warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

const only = process.argv.slice(2);
const pick = (dir) => existsSync(dir)
  ? readdirSync(dir).filter((n) => n.endsWith(".json") && (!only.length || only.includes(n.replace(".json", ""))))
  : [];

function load(dir, name) {
  try { return JSON.parse(readFileSync(join(dir, name), "utf8")); }
  catch (e) { err(name, `invalid JSON: ${e.message}`); return null; }
}

// ── Pass 1: collect all ids across ALL research files (refs are global) ──
const globalIds = new Map(); // id -> file
const allResearch = {};
for (const name of pick(RESEARCH).length && only.length ? readdirSync(RESEARCH).filter((n) => n.endsWith(".json")) : pick(RESEARCH)) {
  const data = load(RESEARCH, name);
  if (!data) continue;
  allResearch[name] = data;
  for (const key of ["sources", "companies", "facilities", "flows", "financial_links", "controls", "refinements", "requirements"]) {
    for (const e of data[key] ?? []) {
      if (!e?.id) continue;
      if (key !== "companies" && key !== "sources" && globalIds.has(e.id) && globalIds.get(e.id) !== name)
        warn(name, `id ${e.id} also defined in ${globalIds.get(e.id)} (will be merged at build)`);
      globalIds.set(e.id, name);
    }
  }
}
const isRef = (id) => globalIds.has(id) || /^gov:[a-z]{2}(-[a-z0-9-]+)?$/.test(id);

function checkEvidence(file, owner, evs, srcIds, { required = true } = {}) {
  if (!Array.isArray(evs) || (required && evs.length === 0)) {
    err(file, `${owner}: evidence[] missing or empty`); return;
  }
  evs.forEach((ev, i) => {
    if (!srcIds.has(ev.source)) err(file, `${owner}.evidence[${i}]: unknown source ${ev.source}`);
    if (!ev.quote || ev.quote.length < 8) err(file, `${owner}.evidence[${i}]: quote missing/too short`);
    if (ev.quote?.length > 700) warn(file, `${owner}.evidence[${i}]: quote >700 chars`);
    if (!ev.locator) err(file, `${owner}.evidence[${i}]: locator missing`);
    if (!ev.supports) err(file, `${owner}.evidence[${i}]: supports missing`);
  });
}

function checkGeo(file, owner, g) {
  if (!g || typeof g.lat !== "number" || typeof g.lon !== "number") { err(file, `${owner}: bad location`); return; }
  if (g.lat < -90 || g.lat > 90 || g.lon < -180 || g.lon > 180) err(file, `${owner}: lat/lon out of range`);
  if (!["site", "city", "region", "country"].includes(g.precision)) err(file, `${owner}: bad precision`);
}

// ── Pass 2: research files ──
for (const [name, d] of Object.entries(allResearch)) {
  if (only.length && !only.includes(name.replace(".json", ""))) continue;
  if (!LAYERS.includes(d.layer)) err(name, `bad layer ${d.layer}`);
  if (!name.startsWith(d.layer)) warn(name, `file name != layer (${d.layer})`);
  for (const k of ["sources", "companies", "facilities", "flows", "financial_links", "controls", "gaps"])
    if (!Array.isArray(d[k])) err(name, `${k} must be an array`);

  const srcIds = new Set();
  // sources may be cited across files; allow any source in any research file
  for (const f of Object.values(allResearch)) for (const s of f.sources ?? []) srcIds.add(s.id);

  const local = new Set();
  const dup = (id) => { if (local.has(id)) err(name, `duplicate id ${id}`); local.add(id); };

  for (const s of d.sources ?? []) {
    dup(s.id);
    if (!s.id?.startsWith("src:")) err(name, `source id ${s.id} must start with src:`);
    if (!/^https?:\/\//.test(s.url ?? "")) err(name, `${s.id}: url missing`);
    if (!(s.doc_type in TIER_OF)) err(name, `${s.id}: unknown doc_type ${s.doc_type}`);
    else if (TIER_OF[s.doc_type] !== s.tier) err(name, `${s.id}: tier ${s.tier} inconsistent with ${s.doc_type} (expected ${TIER_OF[s.doc_type]})`);
    if (!DATE.test(s.document_date ?? "")) err(name, `${s.id}: bad document_date`);
    if (!s.publisher) err(name, `${s.id}: publisher missing`);
  }
  for (const c of d.companies ?? []) {
    dup(c.id);
    if (!c.id?.startsWith("co:")) err(name, `company id ${c.id} must start with co:`);
    if (!/^[A-Z]{2}$/.test(c.country ?? "")) err(name, `${c.id}: bad country`);
    checkGeo(name, c.id, c.hq);
    checkEvidence(name, c.id, c.evidence, srcIds);
  }
  for (const f of d.facilities ?? []) {
    dup(f.id);
    if (!f.id?.startsWith("fac:")) err(name, `facility id ${f.id} must start with fac:`);
    if (!isRef(f.operator)) err(name, `${f.id}: operator ${f.operator} not defined in any research file`);
    if (!LAYERS.includes(f.layer)) err(name, `${f.id}: bad layer`);
    if (!FAC_STATUS.includes(f.status)) err(name, `${f.id}: bad status ${f.status}`);
    if (!/^[A-Z]{2}$/.test(f.country ?? "")) err(name, `${f.id}: bad country`);
    checkGeo(name, f.id, f.location);
    checkEvidence(name, f.id, f.evidence, srcIds);
    if (f.capacity) checkEvidence(name, `${f.id}.capacity`, f.capacity.evidence, srcIds);
    if (!Array.isArray(f.products)) err(name, `${f.id}: products must be array`);
  }
  for (const fl of d.flows ?? []) {
    dup(fl.id);
    if (!fl.id?.startsWith("flow:")) err(name, `flow id ${fl.id} must start with flow:`);
    if (!isRef(fl.from)) err(name, `${fl.id}: from ${fl.from} undefined`);
    if (!isRef(fl.to)) err(name, `${fl.id}: to ${fl.to} undefined`);
    if (!["documented", "inferred"].includes(fl.basis)) err(name, `${fl.id}: bad basis`);
    if (fl.basis === "inferred" && !fl.inference_note) err(name, `${fl.id}: inferred flow needs inference_note`);
    checkEvidence(name, fl.id, fl.evidence, srcIds);
    if (fl.basis === "documented") {
      const tiers = fl.evidence?.map((e) => d.sources.concat(...Object.values(allResearch).map((r) => r.sources)).find((s) => s.id === e.source)?.tier);
      if (tiers?.length && tiers.every((t) => t === 3)) warn(name, `${fl.id}: documented flow supported only by tier 3`);
    }
  }
  for (const fn of d.financial_links ?? []) {
    dup(fn.id);
    if (!fn.id?.startsWith("fin:")) err(name, `fin id ${fn.id} must start with fin:`);
    if (!isRef(fn.from)) err(name, `${fn.id}: from ${fn.from} undefined`);
    if (!isRef(fn.to)) err(name, `${fn.id}: to ${fn.to} undefined`);
    if (!FIN_KINDS.includes(fn.kind)) err(name, `${fn.id}: bad kind ${fn.kind}`);
    if (!DATE.test(fn.date ?? "")) err(name, `${fn.id}: bad date`);
    checkEvidence(name, fn.id, fn.evidence, srcIds);
  }
  for (const c of d.controls ?? []) {
    dup(c.id);
    if (!c.id?.startsWith("ctl:")) err(name, `control id ${c.id} must start with ctl:`);
    if (!CTL_STATUS.includes(c.status)) err(name, `${c.id}: bad status`);
    if (!DATE.test(c.effective_date ?? "")) err(name, `${c.id}: bad effective_date`);
    for (const e of c.entities ?? []) if (!isRef(e)) warn(name, `${c.id}: entity ${e} undefined`);
    checkEvidence(name, c.id, c.evidence, srcIds);
  }

  for (const r of d.refinements ?? []) {
    dup(r.id);
    if (!r.id?.startsWith("ref:")) err(name, `refinement id ${r.id} must start with ref:`);
    if (!globalIds.has(r.flow) || !r.flow.startsWith("flow:")) err(name, `${r.id}: flow ${r.flow} not found`);
    if (!r.from_site && !r.to_site) err(name, `${r.id}: needs from_site or to_site`);
    for (const k of ["from_site", "to_site"]) if (r[k] && !(globalIds.has(r[k]) && r[k].startsWith("fac:"))) err(name, `${r.id}: ${k} ${r[k]} is not a known facility`);
    checkEvidence(name, r.id, r.evidence, srcIds);
  }
  for (const r of d.requirements ?? []) {
    dup(r.id);
    if (!r.id?.startsWith("req:")) err(name, `requirement id ${r.id} must start with req:`);
    if (!isRef(r.node)) err(name, `${r.id}: node ${r.node} undefined`);
    if (!INPUT_KINDS.includes(r.kind)) err(name, `${r.id}: kind "${r.kind}" not one of ${INPUT_KINDS.join(" | ")}`);
    if (!Array.isArray(r.suppliers) || !r.suppliers.length) err(name, `${r.id}: suppliers[] required`);
    for (const x of r.suppliers ?? []) if (!isRef(x)) err(name, `${r.id}: supplier ${x} undefined`);
    if (!r.statement) err(name, `${r.id}: statement required`);
    checkEvidence(name, r.id, r.evidence, srcIds);
  }
}

// ── Pass 3: verification files ──
for (const name of pick(VERIFY)) {
  const v = load(VERIFY, name);
  if (!v) continue;
  const research = allResearch[name];
  if (!research) { err(`verification/${name}`, "no matching research file"); continue; }
  const ents = new Map();
  const companyIds = new Set((research.companies ?? []).map((c) => c.id));
  for (const k of ["companies", "facilities", "flows", "financial_links", "controls", "refinements", "requirements"])
    for (const e of research[k] ?? []) ents.set(e.id, e);
  for (const ec of v.evidence_checks ?? []) {
    if (!ents.has(ec.entity)) err(`verification/${name}`, `evidence_check for unknown entity ${ec.entity}`);
    if (!VERDICTS.includes(ec.verdict)) err(`verification/${name}`, `${ec.entity}: bad verdict ${ec.verdict}`);
  }
  const judged = new Set();
  for (const ev of v.entity_verdicts ?? []) {
    if (!ents.has(ev.entity)) err(`verification/${name}`, `verdict for unknown entity ${ev.entity}`);
    if (!["publish", "publish_flagged", "reject"].includes(ev.verdict)) err(`verification/${name}`, `${ev.entity}: bad verdict`);
    judged.add(ev.entity);
  }
  // Companies are merged across layers and kept unless explicitly rejected; everything else needs a verdict.
  for (const id of ents.keys()) if (!judged.has(id) && !companyIds.has(id)) warn(`verification/${name}`, `no verdict for ${id} (will not be published)`);
}

for (const w of warnings) console.warn("warn ", w);
for (const e of errors) console.error("ERROR", e);
const nFiles = Object.keys(allResearch).length;
console.log(`\n${nFiles} research file(s); ${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
