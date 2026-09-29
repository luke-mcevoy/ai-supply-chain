#!/usr/bin/env node
// Claim audit: every number in an entity's free text (description, inference_note, capacity/amount notes,
// summary) should appear in that entity's own evidence quotes (after normalising "1,920" → "1920", "$3.7 billion" → "3.7").
// Prints entities whose prose carries numbers no quote supports. Run on the verified build.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const a = JSON.parse(readFileSync(new URL("../data/build/atlas.json", import.meta.url)));
const norm = (s) => s.replace(/(\d),(?=\d{3})/g, "$1");
const nums = (s) => [...norm(s).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0])
  .filter((n) => !/^(19|20)\d\d$/.test(n) && n.length > 1 && !/^0\d/.test(n)); // skip years and single digits
const BASELINE = new URL("../data/audit-baseline.json", import.meta.url);
const baseline = existsSync(BASELINE) ? new Set(JSON.parse(readFileSync(BASELINE, "utf8"))) : new Set();
const found = [];
const fresh = [];
let hits = 0;
for (const kind of ["facilities", "flows", "financial_links", "controls"]) {
  for (const e of a[kind]) {
    const prose = [e.description, e.inference_note, e.summary, e.capacity?.note, e.amount?.note].filter(Boolean).join(" ");
    const quotes = norm([...e.evidence, ...(e.capacity?.evidence ?? [])].map((x) => x.quote).join(" ") + " " + (e.review_note ?? ""));
    const missing = [...new Set(nums(prose))].filter((n) => !quotes.includes(n));
    if (missing.length) {
      hits++;
      for (const n of missing) { const k = `${e.id}|${n}`; found.push(k); if (!baseline.has(k)) fresh.push(k); }
      if (!process.argv.includes("--ci")) console.log(`${e.id}\t[${e.review}]\tunquoted: ${missing.join(", ")}`);
    }
  }
}
console.log(`\n${hits} entities with numbers in prose not found in their own quotes (review each; many are cross-references).`);
if (process.argv.includes("--write-baseline")) {
  writeFileSync(BASELINE, JSON.stringify(found.sort(), null, 1) + "\n");
  console.log(`baseline written: ${found.length} reviewed entity|number pairs`);
} else if (fresh.length) {
  console.log(`\n${fresh.length} NEW unquoted number(s) not in data/audit-baseline.json — confirm each against its source, then re-run with --write-baseline:`);
  for (const k of fresh) console.log("  " + k);
  if (process.argv.includes("--ci")) process.exit(1);
} else console.log("no new unquoted numbers since the reviewed baseline");
