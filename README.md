# AI Supply Chain Atlas

A 3D globe of the semiconductor supply chain behind US AI compute, from mines and materials to fabs, servers, data centers, and power plants. Sites, routes, and dollars on the map are tied to a quoted passage in a filing or other primary document.

**Use it:** [ai-supply-chain-atlas.fly.dev](https://ai-supply-chain-atlas.fly.dev/)

Every layer has been through independent verification. A second agent re-fetched each cited document, checked every quote word for word, and approved, flagged or withheld each item. Flagged items carry a visible caveat in the inspector. Read a claim next to its source before you rely on it.

## How to look around

Drag to turn the globe. Scroll or pinch to zoom.

Three views sit at the top:

- **Network** is the physical chain: materials, wafers, equipment, fabs, memory and packaging, design, servers, data centers, and power. A solid line is a route whose source names both parties. A dashed line is inferred from documented facts, and the deduction is on the route.
- **Capital** is who pays whom: investments, contracts, subsidies, and debt. Wider lines are larger amounts.
- **Controls** is export rules over time. Drag the timeline. Red is a restricted destination. Blue is the country imposing the rule.

Open the left panel (☰) to turn stages of the chain on and off, hide inferred or planned sites, or sever a country and see which AI campuses sit downstream. That count is exposure along the recorded routes. It does not model spare inventory or a second supplier.

Click a dot or a line. The panel on the right names the operator, the product, and the verbatim quote, with a link to the document. **Trace chain** walks upstream and downstream. **Sever** drops that site out of the what-if. **Fly to** moves the camera there.

Search with **⌘K** (Ctrl+K on Windows and Linux). **Method** explains the evidence tiers and lists what is still unknown.

## Run it yourself

You need Node.js.

```bash
npm install --prefix app
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The map reads `app/public/atlas.json`, which is already in the repo.

To rebuild that file from the research notes:

```bash
node scripts/validate.mjs
node scripts/build.mjs
```

Without `--draft`, the build publishes only what verification approved. That is what the live site uses. `--draft` includes unverified research and puts a DRAFT banner on the map; use it only for local development.

## How the evidence pipeline works

| Stage    | Output                           | What happens |
| -------- | -------------------------------- | ------------ |
| Analysts | `data/research/<layer>.json`     | One research agent per layer extracts claims with verbatim quotes, citing Tier 1 (legal/regulatory) or Tier 2 (company primary) documents first. |
| Counsel  | `data/verification/<layer>.json` | An independent agent re-fetches every document, checks every quote, and gives each entity a verdict: publish, publish_flagged or reject. See [docs/COUNSEL.md](docs/COUNSEL.md). |
| Build    | `data/build/atlas.json`          | Publishes only approved entities, drops failed evidence, applies corrections and resolves cross-layer routes. |

The evidence standard is in [AGENTS.md](AGENTS.md), and the data contract is in [schema/types.ts](schema/types.ts).
