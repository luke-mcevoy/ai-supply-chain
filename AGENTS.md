# AI Supply Chain Atlas — AGENTS.md

A public, 3D globe of the physical and financial supply chain behind US AI
compute, from mines to power plants, where **every node, route and dollar is
traceable to a legal or regulatory primary document.**

The chain, in order:

```text
materials → wafers_chemicals → equipment → fabrication → memory_packaging
   → design → systems → datacenter → power
cross-cutting: policy (export controls, subsidies) · finance (money flows)
```

## Pipeline

```text
1. Analysts   → data/research/<layer>.json        (schema/types.ts: ResearchFile)
2. Counsel    → data/verification/<layer>.json    (schema/types.ts: VerificationFile)
3. Build      → node scripts/build.mjs → data/build/atlas.json
4. App        → app/ (Vite + React + deck.gl GlobeView) renders atlas.json
```

`node scripts/validate.mjs` checks structure and cross-references. It must
pass before anything gets committed.

## Evidence standard (binding)

| Tier | What                                  | Examples |
| ---- | ------------------------------------- | -------- |
| 1    | Legal / regulatory primary documents  | SEC 10-K/20-F/10-Q/8-K/6-K/S-1, statutory foreign annual reports, Federal Register, CFR, BIS Entity List, CHIPS award announcements & agreements, DOE loans, USAspending/FPDS, FERC / state PUC / NRC dockets, ISO interconnection queues, permits, USGS/EIA/GAO/CRS reports, court filings, MOFCOM/METI notices |
| 2    | Company primary                       | Earnings call transcripts, investor presentations, official press releases, official company sites |
| 3    | Secondary (last resort)               | News. Only when no Tier 1/2 exists, and never the only support for a `documented` flow. Always flagged in the UI. |

Rules:

1. **Quotes are verbatim.** Every `Evidence.quote` must appear word for word
   in the cited document. Counsel fetches every document and checks. A
   paraphrased or invented quote gets the entity rejected.
2. **Cite the document itself, not coverage of it.** A news story about a
   10-K is not the 10-K. Link the SEC filing, the Federal Register page, or
   the company's own release.
3. **Documented vs inferred.** A flow is `documented` only when a Tier 1/2
   source names both parties to the relationship. Otherwise it is
   `inferred`, with an `inference_note` explaining the deduction (for example,
   "ASML is the sole EUV supplier [10-K]; TSMC Fab 21 runs N4 [TSMC release],
   which requires EUV ⇒ ASML→Fab 21"). Inferred flows render dashed.
4. **Dates matter.** Export rules are amended constantly. Record
   `document_date`, and mark superseded rules `superseded` with
   `superseded_by`.
5. **Unknown is an answer.** If something can't be sourced to Tier 1/2, put
   it in `gaps[]`. Do not fill it with a guess.
6. **Coordinates.** `precision: "site"` needs a documented address or site
   description (a filing, permit, or company page naming the site). Geocoding
   that address to lat/lon is fine. Otherwise use `city` or `region`.
7. **Neutral language.** This is a public portfolio piece. Describe what
   documents say, not motives. No characterizations that go beyond the source.

## File ownership (so analysts can work in parallel)

- Each layer file must be **self-contained**. Every `co:` id you reference must
  be defined in your own `companies[]`. Duplicates across files are expected
  and merged at build time.
- `fac:` ids in `from`/`to` must be facilities defined **in your own file**.
  For an endpoint in another layer, use the company id and put the guessed
  facility id in `from_hint` / `to_hint`.
- A layer owns the flows **into** its own facilities: the fabrication file
  owns ASML → TSMC Fab 21, and the datacenter file owns ODM → campus. The
  exception is power, which owns power plant → data center flows.
- CHIPS Act awards and export controls belong to `policy`. Corporate money
  flows (investments, customer concentration, capex, compute contracts,
  circular deals, SPV financing) belong to `finance`. PPAs belong to `power`.

## Canonical IDs

IDs are global across all layer files, so use these exact IDs for these
entities. New entities follow the same pattern: `co:<kebab>`,
`fac:<company-kebab>-<site-kebab>`, `flow:<kebab>`, `fin:<kebab>`,
`ctl:<kebab>`, `src:<kebab>`, `gov:<iso2>-<agency>`.

```text
co:asml co:zeiss co:trumpf co:applied-materials co:lam-research co:tokyo-electron co:kla
co:screen co:advantest co:teradyne co:tsmc co:samsung co:intel co:globalfoundries co:smic
co:sk-hynix co:micron co:amkor co:ase co:nvidia co:amd co:broadcom co:marvell co:alphabet
co:amazon co:microsoft co:meta co:oracle co:openai co:xai co:anthropic co:coreweave
co:softbank co:arm co:synopsys co:cadence co:huawei co:foxconn co:quanta co:wistron
co:wiwynn co:supermicro co:dell co:hpe co:celestica co:shin-etsu co:sumco co:globalwafers
co:siltronic co:sk-siltron co:jsr co:tok co:linde co:air-liquide co:entegris co:hoya
co:sibelco co:the-quartz-corp co:hemlock co:wacker co:mp-materials co:lynas co:umicore
co:constellation co:talen co:vistra co:nextera co:entergy co:dominion co:ge-vernova
co:siemens-energy co:kairos co:x-energy co:oklo co:crusoe co:blue-owl
gov:us-commerce gov:us-bis gov:us-doe gov:us-dod gov:us-nrc gov:us-ferc gov:tw-gov
gov:jp-meti gov:nl-gov gov:cn-mofcom gov:kr-gov gov:de-gov
```

Countries use ISO 3166-1 alpha-2. Money is in the original currency plus an
ISO 4217 code.

## Session journal

Append handoff notes to `SESSION.md` after significant work.
