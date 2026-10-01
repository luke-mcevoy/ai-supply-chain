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
Released 2026-09-28 with user approval: pushed to origin/main and deployed the verified build to https://ai-supply-chain-atlas.fly.dev/ (draft:false confirmed live).

## 2026-09-29 — Claude (Opus 5.5): UX, single points of failure, data table, CI
- Globe: stable data arrays (31→121 fps), trackball drag (lat clamped), camera presets, HTML labels
  with collision avoidance, mobile layout; "Walk the chain" upstream/downstream step-through.
- Map-accuracy fixes: company-level routes now draw at a site only if the route's own evidence names it
  or the company has one site (had drawn every NVIDIA GPU route from its Israel office; 28 unsupported
  hints dropped). Regression test in app/test/published-data.test.ts.
- Single points of failure: knockout model in app/src/atlas.ts (AND across input kinds, OR across
  suppliers; company suppliers split per input kind; inferred routes can't add requirements to documented
  nodes). Result: NVIDIA sole recorded AI-hardware source for 19 campuses (6 on documented routes alone).
- Data table (Sites/Routes/Capital/Rules/Sources) with sort, filter, CSV incl. source URLs + quotes.
- CI (.github/workflows/ci.yml): validate, fresh non-draft build, prose-number audit vs
  data/audit-baseline.json, tsc, vitest (27), vite build, Playwright smoke (6). Deploy job needs a
  FLY_API_TOKEN repo secret (skipped until set). First run green.
Open: set FLY_API_TOKEN for auto-deploy; bump actions to Node-24 versions before GitHub removes Node 20.

## 2026-09-30 — linkage_fabs (EUV requirements)
- Wrote data/research/linkage_fabs.json: 10 lithography requirements (Intel Oregon/Arizona/Ireland, Samsung Hwaseong V1 + Pyeongtaek foundry + Pyeongtaek DRAM, SK hynix M16 + M15X, Micron Hiroshima → co:asml; ASML Veldhoven → Zeiss Oberkochen + Wetzlar), 0 refinements, 9 gaps. All quotes checked programmatically against raw copies (scratchpad/linkage_fabs/build.py).
- Unresolved: TSMC fab-level EUV (tsmc.com/esg.tsmc.com behind Cloudflare/403; sec.gov archives refuse the declared UA), Micron Taiwan EUV, Samsung Taylor, TRUMPF sole-supplier wording, and all supplier-site refinements on the worklist.
