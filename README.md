# AI Supply Chain Atlas

A 3D globe of the physical and financial supply chain behind US AI compute,
from quartz mines and EUV optics to GPUs, AI campuses and the power plants
that run them. **Every site, route, dollar and trade rule traces to a
verbatim quote in a primary document.**

```text
materials → wafers & chemicals → fab equipment → logic fabs → HBM & packaging
   → chip design → servers & racks → AI data centers → power
cross-cutting: export controls · CHIPS subsidies · capital flows
```

## Views

- **Network** shows physical supply routes. Solid routes are documented: a
  primary source names both parties. Dashed routes are inferred, and each
  shows the stated deduction behind it. Node size is the number of AI
  data-center campuses downstream.
- **Capital** shows equity stakes, compute contracts, purchase commitments,
  CHIPS grants and loans, PPAs and structured financing, sized by amount.
- **Controls** shows US BIS, Dutch, Japanese and Chinese export controls on a
  timeline. Restricted destinations are shaded, and blocked routes are marked ✕.
- **Inspector:** click anything to see its evidence (quote, document type,
  tier, date, locator and link to the filing) and its verification status.
- **Analysis:**
  - trace the full upstream and downstream chain of any node;
  - sever a site or a whole country to see downstream exposure;
  - rank chokepoints;
  - search with ⌘K;
  - share the current view by URL.

## Evidence pipeline

| Stage    | Output                                 | What happens |
| -------- | -------------------------------------- | ------------ |
| Analysts | `data/research/<layer>.json`           | One research agent per layer extracts claims with verbatim quotes, citing Tier 1 (legal/regulatory) or Tier 2 (company primary) documents first. |
| Counsel  | `data/verification/<layer>.json`       | An independent agent re-fetches every document, checks every quote, and gives each entity a verdict: publish, publish_flagged or reject. See [docs/COUNSEL.md](docs/COUNSEL.md). |
| Build    | `data/build/atlas.json`                | Publishes only approved entities, drops failed evidence, applies corrections and resolves cross-layer routes. |

The standard is in [AGENTS.md](AGENTS.md); the contract is in
[schema/types.ts](schema/types.ts).

## Run

```bash
cd app && npm install && cd ..
npm run validate          # structural + referential checks
npm run build:data        # verified build (only counsel-approved entities)
npm run build:data:draft  # local dev only: includes unverified research, bannered DRAFT
npm run dev               # http://localhost:5173
npm run build             # validate + verified data + production bundle → app/dist
```

## Limits

- "Exposure" in the what-if means that at least one input to a site passes
  through a severed site. It doesn't model inventory, second sources or
  substitution.
- Where filings name a company but not a site, routes are drawn to that
  company's site at the adjacent stage or to its HQ. The inspector says so
  each time this happens.
- This is not legal or investment advice. Descriptions restate what the
  cited documents say.
