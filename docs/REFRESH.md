# Monthly refresh

Keeps the atlas current without lowering the evidence bar. One run takes the same path as the original build:
analysts research, counsel verifies, CI checks, and a human merges.

## Steps (for the agent running the refresh)

1. **List what's new.** Run `node scripts/refresh-check.mjs`. It writes `data/refresh/candidates-<date>.json` with
   BIS Federal Register documents and SEC filings from tracked companies since `data/refresh/state.json`.
2. **Triage.** Keep only items that change something the atlas shows:
   - a new or amended export control;
   - a new or changed site (opened, cancelled, paused);
   - a new supply relationship;
   - a new deal, loan, award or lease;
   - a status that supersedes one already recorded.

   Skip earnings boilerplate and unrelated filings. Record skipped items in one line each in the PR description.
3. **Research** (analyst subagent, `AGENTS.md` rules). Add or update entities in the right `data/research/<layer>.json`:
   verbatim quotes, Tier 1/2 first, new `src:` entries, `gaps[]` for anything unsourced. To change an existing entity,
   edit it in place and add the new evidence; never delete evidence, and mark superseded rules with `superseded_by`.
4. **Verify** (a *separate* counsel subagent per touched layer, `docs/COUNSEL.md`). Check only new or changed entities
   and merge verdicts into the existing `data/verification/<layer>.json`. Never drop earlier verdicts.
5. **Check.**
   - `node scripts/validate.mjs`
   - `node scripts/build.mjs`
   - `node scripts/audit-numbers.mjs`: confirm any new number against its source, then `--write-baseline`.
   - `cd app && npm test`
6. **Advance and propose.** Run `node scripts/refresh-check.mjs --advance`, commit on a branch `refresh/<yyyy-mm>`, and open
   a pull request summarising added, changed and skipped items, with counsel's counts. **Never push to `main`;** a human
   reviews and merges, and CI must pass first.

## Fetching

Use the declared User-Agent `AI-Supply-Chain-Atlas refresh (personal research project)`. Never use an email, browser
disguise or bypass services. Use the `data.sec.gov` and `efts.sec.gov` endpoints for SEC documents. If a source refuses, mark
it unreachable.
