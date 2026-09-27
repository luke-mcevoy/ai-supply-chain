import type { Layer } from "./atlas";

type RGB = [number, number, number];

// Ordered along the chain so the globe reads as a warm→cool→hot gradient from mine to megawatt.
export const LAYER_COLOR: Record<Layer, RGB> = {
  materials: [214, 138, 58],
  wafers_chemicals: [226, 192, 82],
  equipment: [150, 206, 92],
  fabrication: [56, 196, 158],
  memory_packaging: [62, 176, 228],
  design: [112, 138, 255],
  systems: [168, 116, 245],
  datacenter: [230, 98, 196],
  power: [246, 96, 84],
  policy: [231, 106, 110],
  finance: [240, 196, 80],
};

export const LAYER_LABEL: Record<Layer, string> = {
  materials: "Raw materials",
  wafers_chemicals: "Wafers & chemicals",
  equipment: "Fab equipment",
  fabrication: "Logic fabs",
  memory_packaging: "HBM & packaging",
  design: "Chip design",
  systems: "Servers & racks",
  datacenter: "AI data centers",
  power: "Power",
  policy: "Policy",
  finance: "Capital",
};

export const LAYER_CODE: Record<Layer, string> = {
  materials: "MAT", wafers_chemicals: "WAF", equipment: "EQP", fabrication: "FAB",
  memory_packaging: "PKG", design: "DSN", systems: "SYS", datacenter: "DC", power: "PWR",
  policy: "POL", finance: "FIN",
};

export const C = {
  space: [7, 9, 12] as RGB,
  ocean: [13, 18, 25] as RGB,
  land: [24, 31, 40] as RGB,
  border: [46, 57, 70] as RGB,
  graticule: [30, 40, 52] as RGB,
  text: [230, 237, 243] as RGB,
  muted: [138, 150, 163] as RGB,
  accent: [76, 144, 240] as RGB,
  gold: [240, 196, 80] as RGB,
  danger: [236, 84, 88] as RGB,
  warn: [236, 154, 60] as RGB,
  ok: [50, 164, 103] as RGB,
};

export const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const TIER_LABEL = { 1: "T1 · Legal / regulatory", 2: "T2 · Company primary", 3: "T3 · Secondary" } as const;

export const DOC_LABEL: Record<string, string> = {
  sec_10k: "SEC 10-K", sec_20f: "SEC 20-F", sec_10q: "SEC 10-Q", sec_8k: "SEC 8-K", sec_6k: "SEC 6-K",
  sec_s1: "SEC S-1", sec_def14a: "SEC DEF 14A", foreign_annual_report: "Statutory annual report",
  federal_register: "Federal Register", cfr: "Code of Federal Regulations", bis_entity_list: "BIS Entity List",
  legislation: "Legislation", gov_award: "Government award", gov_contract: "Government contract",
  gov_press_release: "Government release", gov_report: "Government report", regulatory_filing: "Regulatory filing",
  court_filing: "Court filing", earnings_call: "Earnings call", investor_presentation: "Investor presentation",
  company_press_release: "Company release", company_website: "Company website", news: "News", other: "Other",
};

export const FIN_LABEL: Record<string, string> = {
  revenue_concentration: "Revenue concentration", purchase_commitment: "Purchase commitment",
  prepayment: "Prepayment", equity_investment: "Equity investment", acquisition: "Acquisition",
  joint_venture: "Joint venture", government_grant: "Government grant", government_loan: "Government loan",
  tax_credit: "Tax credit", debt_financing: "Debt financing", lease_commitment: "Lease commitment",
  cloud_contract: "Compute contract", ppa: "Power purchase agreement", capex: "Capital expenditure",
  compute_for_equity: "Compute for equity",
};
