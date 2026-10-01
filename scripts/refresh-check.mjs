#!/usr/bin/env node
// Monthly refresh, step 1 (deterministic): list what's new since the last refresh.
//   - Federal Register documents from BIS (export controls) matching chip-related terms
//   - SEC filings (8-K, 10-K, 10-Q, 20-F, 6-K, 40-F, S-1, 424B) from every tracked company
// Writes data/refresh/candidates-<today>.json. With --advance, moves the "last checked" dates to today.
// Requests declare who is fetching; no browser disguise. SEC's data.sec.gov accepts this.

import { readFileSync, writeFileSync } from "node:fs";

const UA = "AI-Supply-Chain-Atlas refresh (personal research project)";
const today = new Date().toISOString().slice(0, 10);
const state = JSON.parse(readFileSync("data/refresh/state.json", "utf8"));
const since = process.argv.find((a) => a.startsWith("--since="))?.slice(8); // e.g. --since=2026-06-01 to look further back
if (since) { state.fr_last = since; state.sec_last = since; }
const atlas = JSON.parse(readFileSync("data/build/atlas.json", "utf8"));
const extra = JSON.parse(readFileSync("data/refresh/tracked.json", "utf8")).ciks;

const get = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Federal Register ──
const TERMS = /semiconductor|integrated circuit|advanced computing|entity list|supercomputer|artificial intelligence|foreign direct product|3A090|3B001|4A090|polysilicon|gallium|germanium/i;
const fr = [];
for (let page = 1; page <= 5; page++) {
  const q = new URLSearchParams({ "conditions[agencies][]": "industry-and-security-bureau",
    "conditions[publication_date][gte]": state.fr_last, per_page: "100", page: String(page), order: "newest" });
  for (const k of ["title", "abstract", "document_number", "html_url", "publication_date", "type", "effective_on"]) q.append("fields[]", k);
  const j = await get(`https://www.federalregister.gov/api/v1/documents.json?${q}`);
  for (const d of j.results ?? []) if (TERMS.test(`${d.title} ${d.abstract ?? ""}`)) fr.push(d);
  if (!j.next_page_url) break;
}

// ── SEC ──
const tracked = new Map();
for (const c of atlas.companies) if (c.sec_cik) tracked.set(c.id, String(c.sec_cik).padStart(10, "0"));
for (const [id, cik] of Object.entries(extra)) tracked.set(id, cik.padStart(10, "0"));
const FORMS = /^(8-K|10-K|10-Q|20-F|6-K|40-F|S-1)/;
// 8-K items worth reading for supply-chain or capital changes: material agreements (1.01/1.02),
// acquisitions (2.01), financial obligations (2.03), restructuring (2.05), Reg FD and other events (7.01/8.01).
const RELEVANT_8K = new Set(["1.01", "1.02", "2.01", "2.03", "2.05", "7.01", "8.01"]);
const sec = [];
const failed = [];
for (const [id, cik] of tracked) {
  try {
    const j = await get(`https://data.sec.gov/submissions/CIK${cik}.json`);
    const r = j.filings.recent;
    for (let i = 0; i < r.form.length; i++) {
      if (r.filingDate[i] < state.sec_last || !FORMS.test(r.form[i])) continue;
      if (r.form[i].startsWith("8-K") && !String(r.items?.[i] ?? "").split(",").some((x) => RELEVANT_8K.has(x.trim()))) continue;
      const acc = r.accessionNumber[i];
      sec.push({ company: id, name: j.name, form: r.form[i], filed: r.filingDate[i], items: r.items?.[i] || undefined,
        description: r.primaryDocDescription?.[i] || undefined, accession: acc,
        url: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replaceAll("-", "")}/${r.primaryDocument[i]}` });
    }
  } catch (e) { failed.push(`${id}: ${e.message}`); }
  await sleep(150); // SEC asks for <10 requests/second
}

const out = { since: { federal_register: state.fr_last, sec: state.sec_last }, checked: today,
  federal_register: fr, sec_filings: sec.sort((a, b) => b.filed.localeCompare(a.filed)), failed };
const file = `data/refresh/candidates-${today}.json`;
writeFileSync(file, JSON.stringify(out, null, 1) + "\n");
console.log(`${fr.length} Federal Register document(s), ${sec.length} SEC filing(s) from ${tracked.size} tracked companies → ${file}`);
if (failed.length) console.log(`could not check: ${failed.join("; ")}`);
if (process.argv.includes("--advance")) {
  writeFileSync("data/refresh/state.json", JSON.stringify({ fr_last: today, sec_last: today }, null, 1) + "\n");
  console.log("state advanced to", today);
}
