import type { Atlas, Facility, Flow, Company, Layer } from "../src/atlas";

const ev = [{ source: "src:x", quote: "q", locator: "l", supports: "existence" }];
export function co(id: string, layers: Layer[] = ["design"]): Company {
  return { id, name: id, country: "US", hq: { lat: 0, lon: 0, precision: "city" }, layers, evidence: ev };
}
export function fac(id: string, operator: string, layer: Layer, lon = 0): Facility {
  return { id, name: id, operator, layer, kind: "k", location: { lat: 10, lon, precision: "site" }, country: "US",
    status: "operational", products: [], evidence: ev, review: "verified", best_tier: 1 };
}
export function flow(from: string, to: string, commodity: string, basis: "documented" | "inferred" = "documented"): Flow {
  return { id: `flow:${from}>${to}:${commodity}`, from, to, from_node: from, to_node: to, commodity, description: "", basis,
    layer: "design", resolution: "direct/direct", evidence: ev, review: "verified", best_tier: 1 };
}
export function atlas(parts: { companies?: Company[]; facilities?: Facility[]; flows?: Flow[] }): Atlas {
  return { built_at: "", draft: false, stats: { counts: {}, layers: {} }, gaps: [], controls: [], financial_links: [],
    sources: [{ id: "src:x", title: "t", publisher: "p", url: "https://x", doc_type: "sec_10k", tier: 1, document_date: "2026-01-01", accessed: "2026-01-01" }],
    companies: parts.companies ?? [], facilities: parts.facilities ?? [], flows: parts.flows ?? [] };
}
