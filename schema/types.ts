/**
 * AI Supply Chain Atlas — data contract.
 *
 * Every research file in data/research/*.json is a ResearchFile.
 * Every verification file in data/verification/*.json is a VerificationFile.
 * scripts/build.mjs merges both into data/build/atlas.json, which the app consumes.
 *
 * Nothing reaches the globe without evidence, and nothing is published
 * without a verifier verdict.
 */

export type Layer =
  | "materials" // mining, refining: quartz, polysilicon, gallium, germanium, rare earths, tungsten, fluorspar, neon
  | "wafers_chemicals" // silicon wafers, photoresists, specialty gases, wet chemicals, masks/blanks
  | "equipment" // lithography (EUV/DUV), deposition, etch, metrology, test
  | "fabrication" // front-end logic foundries
  | "memory_packaging" // DRAM/HBM fabs, advanced packaging (CoWoS, SoIC), OSATs
  | "design" // fabless / in-house accelerators, EDA, IP
  | "systems" // server/rack assembly, networking, ODMs
  | "datacenter" // AI data center campuses
  | "power" // generation, PPAs, grid, transformers/turbines
  | "policy" // export controls, subsidies (cross-cutting)
  | "finance"; // cross-cutting money flows

export type DocType =
  // Tier 1 — legal / regulatory primary documents
  | "sec_10k" | "sec_20f" | "sec_10q" | "sec_8k" | "sec_6k" | "sec_s1" | "sec_def14a"
  | "foreign_annual_report" // statutory annual report filed with a foreign regulator/exchange (TWSE, KRX, TSE, Euronext)
  | "federal_register" | "cfr" | "bis_entity_list" | "legislation"
  | "gov_award" // e.g. CHIPS Program Office award, DOE loan
  | "gov_contract" // USAspending / SAM.gov / FPDS
  | "gov_press_release" // agency release (commerce.gov, doe.gov, MOFCOM, METI)
  | "gov_report" // USGS Mineral Commodity Summaries, CRS, GAO, EIA
  | "regulatory_filing" // FERC dockets, state PUC filings, ISO/RTO interconnection queues, NRC dockets, permits
  | "court_filing"
  // Tier 2 — company primary
  | "earnings_call" | "investor_presentation" | "company_press_release" | "company_website"
  // Tier 3 — secondary (last resort)
  | "news" | "other";

export type Tier = 1 | 2 | 3;

export interface Source {
  id: string; // "src:<slug>"
  title: string;
  publisher: string; // issuing entity, e.g. "NVIDIA Corporation", "U.S. Department of Commerce, BIS"
  url: string; // canonical URL of the document itself (not a news article about it)
  doc_type: DocType;
  tier: Tier;
  document_date: string; // YYYY-MM-DD (filing / publication / effective date)
  accessed: string; // YYYY-MM-DD
  identifier?: string; // accession no., FR citation ("89 FR 96790"), docket no., award no.
}

export interface Evidence {
  source: string; // Source.id
  quote: string; // VERBATIM excerpt from the document, <= 500 chars
  locator: string; // page / section / Item 1A / table name — enough to find the quote
  supports: string; // which field(s) this supports: "existence", "location", "amount", "relationship", "status"...
}

export interface GeoPoint {
  lat: number;
  lon: number;
  precision: "site" | "city" | "region" | "country";
  address?: string;
}

export interface Company {
  id: string; // "co:<slug>" — see CANONICAL IDS in AGENTS.md
  name: string;
  country: string; // ISO 3166-1 alpha-2 of headquarters
  tickers?: string[]; // "NASDAQ:NVDA"
  sec_cik?: string;
  hq: GeoPoint;
  layers: Layer[];
  evidence: Evidence[];
}

export type FacilityStatus =
  | "operational" | "under_construction" | "announced" | "planned" | "paused" | "cancelled";

export interface Quantity {
  value: number;
  unit: string; // "wafers/month", "MW", "GW", "tonnes/yr", "USD", ...
  as_of: string; // YYYY-MM-DD or YYYY
  note?: string;
  evidence: Evidence[];
}

export interface Facility {
  id: string; // "fac:<company-slug>-<site-slug>"
  name: string;
  operator: string; // Company.id
  layer: Layer;
  kind: string; // snake_case, e.g. "euv_scanner_assembly", "leading_edge_logic_fab", "hbm_dram_fab", "cowos_packaging", "server_assembly", "ai_datacenter_campus", "nuclear_plant", "mine", "refinery"
  location: GeoPoint;
  country: string; // ISO2
  status: FacilityStatus;
  start_year?: number;
  capacity?: Quantity;
  products: string[];
  evidence: Evidence[]; // must include support for existence AND location
}

export interface Flow {
  id: string; // "flow:<slug>"
  from: string; // Facility.id or Company.id
  to: string; // Facility.id or Company.id
  // Cross-layer endpoints: if the other end lives in another layer's file, set from/to to the
  // Company.id and put your best-guess facility id here. The build resolves hints that exist.
  from_hint?: string;
  to_hint?: string;
  commodity: string; // "EUV lithography systems", "HBM3E", "CoWoS-L packaged GPUs", "electricity"
  description: string;
  basis: "documented" | "inferred";
  // documented: a Tier 1/2 source names BOTH parties in this relationship.
  // inferred: each party's role is documented but the specific link is deduced; inference_note is mandatory.
  inference_note?: string;
  volume?: Quantity;
  evidence: Evidence[];
}

export type FinancialKind =
  | "revenue_concentration" | "purchase_commitment" | "prepayment" | "equity_investment"
  | "acquisition" | "joint_venture" | "government_grant" | "government_loan" | "tax_credit"
  | "debt_financing" | "lease_commitment" | "cloud_contract" | "ppa" | "capex" | "compute_for_equity";

export interface FinancialLink {
  id: string; // "fin:<slug>"
  from: string; // payer / investor (Company.id, or "gov:<iso2>-<agency>")
  to: string; // payee / investee
  kind: FinancialKind;
  amount?: { value: number; currency: string; period?: string; note?: string };
  date: string; // YYYY-MM-DD of agreement / disclosure
  description: string;
  evidence: Evidence[];
}

export interface Control {
  id: string; // "ctl:<slug>"
  authority: string; // "US-BIS", "NL-MinBuZa", "JP-METI", "CN-MOFCOM", "TW-MOEA", ...
  instrument: string; // "Interim Final Rule: Implementation of Additional Export Controls..."
  citation: string; // "87 FR 76738" / "15 CFR 744.23" / "MOFCOM Announcement No. 46 of 2024"
  effective_date: string;
  status: "in_force" | "amended" | "superseded" | "rescinded" | "proposed";
  superseded_by?: string; // Control.id
  items: string[]; // ECCNs or item descriptions: "3B001.f.1 (EUV lithography)", "3A090.a", "gallium"
  applies_from: string[]; // exporting jurisdictions (ISO2) — who is restricted from shipping
  applies_to: string[]; // destinations (ISO2) or country groups ("D:5", "Macau")
  entities?: string[]; // Company.ids specifically named
  summary: string;
  evidence: Evidence[];
}

export interface Gap {
  topic: string;
  why: string; // why it could not be sourced to Tier 1/2
  would_need: string; // what document/data would close it
}

export interface ResearchFile {
  layer: Layer;
  analyst: string;
  generated_at: string;
  sources: Source[];
  companies: Company[];
  facilities: Facility[];
  flows: Flow[];
  financial_links: FinancialLink[];
  controls: Control[];
  gaps: Gap[];
}

// ─── Verification ─────────────────────────────────────────────────────────

export type EvidenceVerdict =
  | "verified" // document reached, quote present, supports the claim
  | "verified_with_correction" // quote present but a field needed fixing (see correction)
  | "quote_not_found" // document reached but quote not in it
  | "does_not_support" // quote present but doesn't support the stated claim
  | "superseded" // document outdated by a later governing document
  | "insufficient_tier" // source is news/secondary where a primary exists or is required
  | "unreachable"; // could not retrieve the document

export interface SourceCheck {
  source: string;
  reachable: boolean;
  doc_type_ok: boolean;
  tier_assigned: Tier; // verifier's tier, may differ from analyst's
  date_ok: boolean;
  notes?: string;
}

export interface EvidenceCheck {
  entity: string; // id of company / facility / flow / fin / ctl
  evidence_index: number; // index into that entity's evidence[] (or capacity.evidence as "capacity:<i>" in notes)
  verdict: EvidenceVerdict;
  notes?: string;
}

export interface EntityVerdict {
  entity: string;
  verdict: "publish" | "publish_flagged" | "reject";
  // publish: ≥1 verified Tier 1/2 evidence for every material field
  // publish_flagged: publishable but with visible caveat (tier 3 only, inferred link, stale)
  // reject: must not appear on the globe
  reasons: string;
  corrections?: Record<string, unknown>; // field path → corrected value (applied at build)
}

export interface VerificationFile {
  layer: Layer;
  verifier: string;
  verified_at: string;
  source_checks: SourceCheck[];
  evidence_checks: EvidenceCheck[];
  entity_verdicts: EntityVerdict[];
  summary: string;
}
