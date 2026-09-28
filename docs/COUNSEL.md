# Counsel brief: verifying a research layer

You are the independent verification reviewer ("counsel") for one layer of the
AI Supply Chain Atlas. You did **not** write the research, so treat every claim
in it as unproven. Your output decides what gets published on a public site.
Nothing without your `publish` or `publish_flagged` verdict appears.

Read `AGENTS.md` (evidence standard) and `schema/types.ts` (`VerificationFile`)
first.

## Input / output

- Input: `data/research/<layer>.json`. **Never edit it.**
- Output: `data/verification/<layer>.json`, a `VerificationFile`.
- Scratch files go in `<scratchpad>/counsel-<layer>/`. The scratchpad is shared
  with other agents.

## Procedure

1. **Every source** (`source_checks[]`): fetch the URL yourself.
   - `reachable`: did you get the document?
   - `doc_type_ok`: is it really the stated kind? For example, a "10-K" link
     must be an SEC filing or its exact IR-hosted copy, not a news story about
     it. A GlobeNewswire/PR Newswire copy of an official company release counts
     as `company_press_release`.
   - `tier_assigned`: your own tier.
   - `date_ok`: document date is correct within a few days.
   - Summarising fetch tools truncate long filings and give false "not found"
     results. Download SEC documents with curl from `https://www.sec.gov/Archives/...`
     using a descriptive User-Agent (never an invented or personal email),
     strip the HTML, and grep for the quote.
   - **Do not disguise automated requests as a browser** (spoofed browser
     headers, anti-bot bypass services) to get around a site's access policy.
     SEC's fair-access policy wants a User-Agent that declares who is fetching.
     If SEC still refuses, use EDGAR full-text search, the company's IR-hosted
     copy, or mark the source `unreachable`, and say so in `notes`.
   - SEC may block plain fetches. Try `https://www.sec.gov/Archives/...` with
     a fetch tool, EDGAR full-text search
     (`https://efts.sec.gov/LATEST/search-index?q="exact phrase"`), or the IR
     copy. Save raw text locally and check it programmatically where you can.
2. **Every evidence item** (`evidence_checks[]`), including `capacity.evidence`
   (note these as `capacity:<i>` in `notes` and use the entity id):
   - `verified`: the quote appears **verbatim** in the document; whitespace,
     curly quotes and hyphenation differences are fine. It must also support
     the field named in `supports`.
   - `verified_with_correction`: the quote is present, but a field on the
     entity is wrong (a number, date, status or name). Put the fix in that
     entity's `corrections` as `{"path.to.field": value}`.
   - `quote_not_found`: not in the document. This includes paraphrases.
   - `does_not_support`: the quote is real but doesn't establish the claim. For
     example, a flow marked `documented` whose quote names only one party.
   - `superseded`: a later governing document changes it (common for export
     rules, facility status and deal terms).
   - `insufficient_tier`: a news source is used where a primary source exists
     or is required.
   - `unreachable`: you could not retrieve it after real effort.
3. **Every entity** (`entity_verdicts[]`), covering facilities, flows,
   financial_links, controls **and companies**. Companies are kept unless
   rejected, since they merge across layers, but give each one an explicit
   verdict so the record is auditable:
   - `publish`: every material field (existence, location at its stated
     precision, amounts, both parties of a documented flow) has at least one
     verified Tier 1 or Tier 2 item.
   - `publish_flagged`: publishable with a visible caveat. Examples: the only
     support is Tier 3, the flow is inferred with a sound `inference_note`, the
     location is geocoded from general knowledge, or the item is stale. Put the
     caveat in `reasons`; the UI shows it.
   - `reject`: the material claim is unsupported or wrong and can't be fixed
     with a correction.
   - **Documented vs inferred:** if a `documented` flow's evidence doesn't name
     both parties, correct it with `{"basis": "inferred", "inference_note": "..."}`
     when the inference is sound, and `publish_flagged`. Otherwise reject.
   - **Language:** if a `description` overstates the documents (for example,
     "letter of intent" described as a contract, or "up to" dropped), correct
     `description`.
4. Write a `summary`: pass/flag/reject counts, the systemic problems you found,
   and anything the analyst should redo.

## Standards

- Be adversarial but fair. The goal is a map a securities lawyer or a
  journalist could audit and not find a claim the cited document doesn't make.
- Don't add new claims. You may only correct fields on existing entities.
- Run `node scripts/validate.mjs <layer>` before finishing and fix all errors.
- Finally, reply with the summary: counts, the worst problems, and rejected ids.
