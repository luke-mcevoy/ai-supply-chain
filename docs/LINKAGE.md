# Linkage brief: pin routes to sites, document requirements

You are an analyst on the AI Supply Chain Atlas. Read `AGENTS.md` (evidence standard) and
`schema/types.ts` (`Refinement`, `Requirement`) first. The same rules apply: verbatim quotes, Tier 1/2,
neutral language, and an independent counsel will re-fetch every document.

## Why this round exists

Many routes name a company but not a site (for example "TSMC → NVIDIA: GPU dies"), so the map draws
them from headquarters. Documents sometimes do say *which* site: "Blackwell wafers are produced at
TSMC's Arizona fab", a CHIPS award naming the products a plant makes, a permit, an 8-K. Your job is to
find those documents.

## Output

Write `data/research/<your file>.json` as a ResearchFile with `"layer": "linkage"`. Leave the normal
arrays empty except `sources`, `companies` (define any company you reference that is not already
defined elsewhere) and `gaps`, and fill:

- **`refinements[]`**: `{ id: "ref:<kebab>", flow, from_site?, to_site?, evidence[] }`. `flow` is an
  existing route id from your worklist. The evidence must name the specific site (or an unambiguous site
  description) AND the relationship it supports. If only one end can be pinned, set only that end.
- **`requirements[]`**: `{ id: "req:<kebab>", node, kind, suppliers[], statement, evidence[] }`.
  A documented need: `node` requires input `kind`, and the documents name `suppliers` as its sources.
  The evidence must establish BOTH the need and the supplier set. Example: TSMC states which fabs make
  N3 and that N3 uses EUV, and ASML's 20-F says it is the only manufacturer of EUV systems ⇒
  `req:tsmc-fab18-euv { node: fac:tsmc-fab18-..., kind: "lithography", suppliers: [co:asml] }`.
  List every supplier the documents name. A requirement with one supplier is a single-point-of-failure
  claim, so only assert sole supply when a document says so ("sole", "only", "single source").

`kind` must be one of: contract manufacturing, electricity, generation equipment, networking,
lithography, process tools, memory, logic dies, packaging, polysilicon, rare earths, germanium
feedstock, fluorspar, photoresist, industrial gases, chemicals & materials, silicon wafers,
AI compute hardware, IP & EDA.

Use existing facility ids. They are listed in `data/build/atlas.json` → `facilities[]`; grep it.
Do not create new facilities in this round. If the site you need doesn't exist, add a gap.

## Rules

- Quotes must be verbatim from text you fetched. Save raw copies in your scratch folder and check quotes
  programmatically before writing.
- Fetching: use a declared project User-Agent such as "AI-Supply-Chain-Atlas research (personal research
  project)". Never use an email. Never disguise requests as a browser or use bypass services. For SEC
  documents, use EDGAR full-text search (`https://efts.sec.gov/LATEST/search-index?q="phrase"&ciks=...`)
  or `data.sec.gov`; if a site refuses you, move on and log a gap.
- Save after every ~5 records. Run `node scripts/validate.mjs <your file name without .json>` and fix
  all errors before finishing.
- No match is a fine answer: put it in `gaps[]` with what document would settle it.
