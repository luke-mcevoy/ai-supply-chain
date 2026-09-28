# Session journal

## 2026-09-27 — Claude (Opus 5.5): kickoff
Done:
- Repo, data contract (schema/types.ts), evidence standard + ownership rules (AGENTS.md),
  validator (scripts/validate.mjs), build/merge step (scripts/build.mjs).
- App scaffold (app/: Vite + React + deck.gl GlobeView). Written: src/atlas.ts (types, graph
  traversal, chokepoint reach), src/theme.ts, src/geo.ts, src/store.ts, src/Globe.tsx
  (network / capital / controls modes, trace, sever what-if), src/ui/Evidence.tsx, src/ui/Inspector.tsx.
In flight: 11 analyst subagents writing data/research/<layer>.json (materials, wafers_chemicals,
  equipment, fabrication, memory_packaging, design, systems, datacenter, power, policy, finance).
  Check which files exist; re-run any missing layer with the same brief (see AGENTS.md).
Next:
1. Remaining UI: TopBar, LayerRail (chain toggles, chokepoints, sever scenarios), Tooltip,
   Timeline (controls date scrubber), ⌘K Palette, About/methodology; App.tsx, main.tsx,
   styles.css (Blueprint-dark look), index.html, vite.config.ts, tsconfig.json. Then typecheck.
2. `node scripts/validate.mjs` on the research files, then launch legal-counsel agents (one per layer)
   → data/verification/<layer>.json (VerificationFile: re-fetch every URL, verbatim quote check).
3. `node scripts/build.mjs` (use --draft only for local dev), run app, screenshot, polish, deploy.

## 2026-09-27 — deploy to Fly
Done:
- Dockerfile + nginx.conf + fly.toml. App `ai-supply-chain-atlas` in ewr, https://ai-supply-chain-atlas.fly.dev/
- Serves the draft atlas built 2026-09-27T19:00:44Z (no verification files yet; UI shows DRAFT BUILD).
- Machine stops when idle and starts on the next request.
- Public GitHub repo: https://github.com/luke-mcevoy/ai-supply-chain (README points at the Fly app).

## 2026-09-27 (evening) — Claude (Opus 5.5): research complete, counsel running
Done:
- 10/11 research layers final (policy still running; checkpoint has 36 controls). Draft totals:
  231 sites, 178 routes, 154 money flows, 364 sources (all T1/T2), 107 gaps.
- build.mjs merges duplicate ids across layers (union of surviving evidence) instead of overwriting.
- Capital view draws self-links (capex, lease backlog, unnamed counterparties) as rings at HQ.
- Restored the Fly/usage README that my README commit had overwritten; pipeline section appended.
In flight: counsel (Sonnet, docs/COUNSEL.md) for design, datacenter, equipment, fabrication.
Queue: counsel for power, memory_packaging, finance, materials, wafers_chemicals, systems, policy.
Notes:
- Keep ≤5 agents concurrent; 14 at once hit the 5-hour usage limit twice.
- SEC needs a declared User-Agent with contact; agents told not to invent emails — ask the user.
- Local commits are not pushed; the Fly deploy serves the draft build.

## 2026-09-28 — Claude (Opus 5.5): counsel results + follow-ups
Verified: design, datacenter, fabrication, power, policy, equipment, memory_packaging, finance.
Running: materials, wafers_chemicals, systems.
Research follow-ups raised by counsel (add as sources/evidence, then re-verify):
- finance: CoreWeave 8-K 2026-09-22 (acc. 0001769628-26-000432) for the upsized $3.7B 2033 notes;
  quote Microsoft's cash-flow line ($115,948M additions to property and equipment).
- equipment: Applied Materials FY2025 10-K and Ultra Clean FY2025 10-K were unreachable (SEC blocks
  undeclared automated tools); UCT flows are withheld until re-verified.
- fabrication: TSMC AR has uncited JASM fab-2 node and ESMC product focus (products[] empty).
- memory_packaging: TSMC annual-report document_date is approximate (~2026-05).
Process: counsel may not disguise requests as a browser (docs/COUNSEL.md). SEC access with a declared
contact User-Agent would remove most "unreachable" results — needs the user's chosen contact.
Build: company endpoints resolve to a site only when unambiguous; otherwise drawn at HQ (labelled).

## 2026-09-28 (later) — Claude (Opus 5.5): all layers verified, prose audit done
- Counsel verified all 11 layers. Verified build: 231 sites, 165 routes (117 documented), 152 money flows,
  53 trade rules, 377 cited sources (229 T1 / 147 T2 / 1 T3); 471 verified + 130 flagged entities; 20 withheld.
- Prose audit (scripts/audit-numbers.mjs + second-pass counsel): ~108 prose numbers confirmed in sources;
  1 unsupported xAI Colossus 2 "next phase" figure removed. Remaining audit hits are confirmed cross-references.
- app/public/atlas.json is now the VERIFIED build (no --draft). Deploy should serve this.
Pending user go-ahead: git push to origin; redeploy Fly (fly.toml present) from the verified build.
