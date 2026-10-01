// Types for data/build/atlas.json (the build output of scripts/build.mjs)
// plus the in-memory indexes and graph analytics the UI runs on.

export type Layer =
  | "materials" | "wafers_chemicals" | "equipment" | "fabrication" | "memory_packaging"
  | "design" | "systems" | "datacenter" | "power" | "policy" | "finance";

export const CHAIN: Layer[] = ["materials", "wafers_chemicals", "equipment", "fabrication",
  "memory_packaging", "design", "systems", "datacenter", "power"];

export type Review = "verified" | "flagged" | "unverified";

export interface Source {
  id: string; title: string; publisher: string; url: string; doc_type: string;
  tier: 1 | 2 | 3; document_date: string; accessed: string; identifier?: string;
}
export interface Evidence { source: string; quote: string; locator: string; supports: string }
export interface GeoPoint { lat: number; lon: number; precision: string; address?: string }
export interface Quantity { value: number; unit: string; as_of: string; note?: string; evidence: Evidence[] }

interface Reviewed { review: Review; review_note?: string; best_tier: 1 | 2 | 3; evidence: Evidence[] }

export interface Company {
  id: string; name: string; country: string; tickers?: string[]; hq: GeoPoint;
  layers: Layer[]; evidence: Evidence[];
}
export interface Facility extends Reviewed {
  id: string; name: string; operator: string; layer: Layer; kind: string;
  location: GeoPoint; country: string; status: string; start_year?: number;
  capacity?: Quantity; products: string[];
}
export interface Flow extends Reviewed {
  id: string; from: string; to: string; from_node: string; to_node: string;
  commodity: string; description: string; basis: "documented" | "inferred";
  inference_note?: string; volume?: Quantity; layer: Layer; resolution: string;
}
export interface FinancialLink extends Reviewed {
  id: string; from: string; to: string; kind: string;
  amount?: { value: number; currency: string; period?: string; note?: string };
  date: string; description: string;
}
export interface Control extends Reviewed {
  id: string; authority: string; instrument: string; citation: string; effective_date: string;
  status: string; superseded_by?: string; items: string[]; applies_from: string[];
  applies_to: string[]; entities?: string[]; summary: string;
}
export interface Gap { topic: string; why: string; would_need: string; layer: Layer }
export interface Requirement extends Reviewed {
  id: string; node: string; kind: string; suppliers: string[]; statement: string;
}

export interface Atlas {
  built_at: string; draft: boolean;
  stats: { counts: Record<string, number>; layers: Record<string, string> };
  sources: Source[]; companies: Company[]; facilities: Facility[]; flows: Flow[];
  financial_links: FinancialLink[]; controls: Control[]; gaps: Gap[];
  requirements?: Requirement[];
}

export type Entity =
  | { type: "facility"; item: Facility }
  | { type: "company"; item: Company }
  | { type: "flow"; item: Flow }
  | { type: "fin"; item: FinancialLink }
  | { type: "control"; item: Control };

export interface Index {
  atlas: Atlas;
  source: Map<string, Source>;
  company: Map<string, Company>;
  facility: Map<string, Facility>;
  flow: Map<string, Flow>;
  fin: Map<string, FinancialLink>;
  control: Map<string, Control>;
  out: Map<string, Flow[]>; // node → flows leaving it
  in: Map<string, Flow[]>; // node → flows entering it
  facilitiesByOperator: Map<string, Facility[]>;
  finByCompany: Map<string, FinancialLink[]>;
  /** Number of AI data-center campuses reachable downstream of each node. */
  reach: Map<string, number>;
  /** Control active interval [start, end) in ms since epoch; end = Infinity if not superseded. */
  controlSpan: Map<string, [number, number]>;
  /** Single-point-of-failure analysis (see buildKnockout). */
  ko: Knockout;
}

const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]); };

export function buildIndex(atlas: Atlas): Index {
  const idx: Index = {
    atlas,
    source: new Map(atlas.sources.map((s) => [s.id, s])),
    company: new Map(atlas.companies.map((c) => [c.id, c])),
    facility: new Map(atlas.facilities.map((f) => [f.id, f])),
    flow: new Map(atlas.flows.map((f) => [f.id, f])),
    fin: new Map(atlas.financial_links.map((f) => [f.id, f])),
    control: new Map(atlas.controls.map((c) => [c.id, c])),
    out: new Map(), in: new Map(), facilitiesByOperator: new Map(), finByCompany: new Map(),
    reach: new Map(), controlSpan: new Map(), ko: { inputs: new Map(), critical: new Map(), criticalDoc: new Map() },
  };
  for (const f of atlas.flows) { push(idx.out, f.from_node, f); push(idx.in, f.to_node, f); }
  for (const f of atlas.facilities) push(idx.facilitiesByOperator, f.operator, f);
  for (const f of atlas.financial_links) { push(idx.finByCompany, f.from, f); if (f.to !== f.from) push(idx.finByCompany, f.to, f); }

  const dcs = new Set(atlas.facilities.filter((f) => f.layer === "datacenter").map((f) => f.id));
  for (const id of [...idx.facility.keys(), ...idx.company.keys()]) {
    const { nodes } = traverse(idx, [id], "down");
    let n = 0;
    for (const x of nodes) if (dcs.has(x) && x !== id) n++;
    idx.reach.set(id, n);
  }

  const t = (d: string) => Date.parse(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d);
  for (const c of atlas.controls) {
    const start = t(c.effective_date);
    const next = c.superseded_by ? idx.control.get(c.superseded_by) : undefined;
    const end = next ? t(next.effective_date) : c.status === "rescinded" ? start : Infinity;
    idx.controlSpan.set(c.id, [start, end]);
  }
  idx.ko = buildKnockout(idx);
  return idx;
}

/** BFS over the flow graph. Company nodes also expand into their facilities (a company is its sites). */
export function traverse(idx: Index, seeds: string[], dir: "up" | "down" | "both") {
  const nodes = new Set<string>();
  const flows = new Set<string>();
  const run = (d: "up" | "down") => {
    // Queue entries carry whether we arrived at a company *from one of its own facilities*;
    // in that case we must not fan back out to sibling facilities (Fab 21 ≠ all of TSMC).
    const q: [string, boolean][] = seeds.map((s) => [s, false]);
    const seen = new Set(seeds);
    const enqueue = (m: string, fromOwnFacility = false) => {
      if (!seen.has(m)) { seen.add(m); q.push([m, fromOwnFacility]); }
    };
    while (q.length) {
      const [n, fromOwnFacility] = q.shift()!;
      nodes.add(n);
      for (const f of (d === "down" ? idx.out : idx.in).get(n) ?? []) {
        flows.add(f.id);
        enqueue(d === "down" ? f.to_node : f.from_node);
      }
      // A company reached as a seed or via a flow (hq fallback) stands for all of its sites.
      if (!fromOwnFacility && !idx.facility.has(n)) for (const fac of idx.facilitiesByOperator.get(n) ?? []) enqueue(fac.id);
      const fac = idx.facility.get(n);
      if (fac) {
        // Vertical integration: a site feeds its own company's sites at *later* stages (a TSMC fab
        // feeds TSMC packaging), never its peers at the same stage (Fab 21 ≠ all TSMC fabs).
        const stage = CHAIN.indexOf(fac.layer);
        if (stage >= 0) for (const sib of idx.facilitiesByOperator.get(fac.operator) ?? []) {
          const s2 = CHAIN.indexOf(sib.layer);
          if (s2 >= 0 && (d === "down" ? s2 > stage : s2 < stage)) enqueue(sib.id, true);
        }
        // ...and participates in flows drawn at company level.
        if (idx.out.has(fac.operator) || idx.in.has(fac.operator)) enqueue(fac.operator, true);
      }
    }
  };
  if (dir !== "up") run("down");
  if (dir !== "down") run("up");
  return { nodes, flows };
}

/**
 * What a control does on the map. Only "restrict" (an export control) shades destinations:
 * suspensions/stays relax an earlier rule, and Section 232-style measures restrict *imports*.
 */
export function ctlEffect(c: Control): "restrict" | "relax" | "import" | "entities" {
  if (/suspen|stay|rescission|rescind|relief/i.test(`${c.id} ${c.instrument}`)) return "relax";
  // Entity List–style rules restrict named parties; their applies_to lists where those parties sit,
  // which must not be read as a country-wide restriction.
  if (/entity[- ]list/i.test(`${c.id} ${c.instrument}`) && !/advanced[- ]computing|semiconductor manufacturing items/i.test(c.instrument)) return "entities";
  const own = c.authority.split("-")[0];
  if (c.applies_to.includes(own) && c.applies_from.some((f) => /origin|import/i.test(f))) return "import";
  return "restrict";
}

export function locate(idx: Index, id: string): GeoPoint | undefined {
  return idx.facility.get(id)?.location ?? idx.company.get(id)?.hq;
}

export function nodeName(idx: Index, id: string): string {
  if (id.startsWith("gov:")) return GOV_NAMES[id] ?? id.replace("gov:", "").toUpperCase();
  return idx.facility.get(id)?.name ?? idx.company.get(id)?.name ?? id;
}

export function nodeLayer(idx: Index, id: string): Layer | undefined {
  return idx.facility.get(id)?.layer ?? idx.company.get(id)?.layers?.[0];
}

export const GOV_NAMES: Record<string, string> = {
  "gov:us-commerce": "U.S. Department of Commerce", "gov:us-bis": "U.S. Bureau of Industry and Security",
  "gov:us-doe": "U.S. Department of Energy", "gov:us-dod": "U.S. Department of Defense",
  "gov:us-nrc": "U.S. Nuclear Regulatory Commission", "gov:us-ferc": "FERC",
  "gov:tw-gov": "Government of Taiwan", "gov:jp-meti": "Japan METI", "gov:nl-gov": "Government of the Netherlands",
  "gov:cn-mofcom": "China MOFCOM", "gov:kr-gov": "Government of South Korea", "gov:de-gov": "Government of Germany",
};

/** Government actors have no HQ record; place them at their capitals. */
export const GOV_LOC: Record<string, [number, number]> = {
  us: [-77.0365, 38.8977], tw: [121.5654, 25.033], jp: [139.6917, 35.6895], nl: [4.3007, 52.0705],
  cn: [116.4074, 39.9042], kr: [126.978, 37.5665], de: [13.405, 52.52],
};

export function locateAny(idx: Index, id: string): [number, number] | undefined {
  const g = locate(idx, id);
  if (g) return [g.lon, g.lat];
  const m = /^gov:([a-z]{2})/.exec(id);
  return m ? GOV_LOC[m[1]] : undefined;
}

export function formatMoney(a?: { value: number; currency: string }) {
  if (!a) return "—";
  const v = Math.abs(a.value);
  const s = v >= 1e12 ? `${(a.value / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(a.value / 1e9).toFixed(v >= 1e10 ? 0 : 1)}B`
    : v >= 1e6 ? `${(a.value / 1e6).toFixed(0)}M` : a.value.toLocaleString();
  return `${a.currency === "USD" ? "$" : a.currency + " "}${s}`;
}

export function usdValue(a?: { value: number; currency: string }): number {
  if (!a) return 0;
  // Only for relative sizing of arcs, never displayed. Rough static rates; non-USD amounts drawn approximately.
  const fx: Record<string, number> = { USD: 1, EUR: 1.1, JPY: 0.0068, KRW: 0.00073, TWD: 0.031, CNY: 0.14, GBP: 1.3 };
  return a.value * (fx[a.currency] ?? 1);
}

// ─── Chain walk ("tour") ─────────────────────────────────────────────────────

/** Walk order from raw material to finished AI compute. Power is an input to the campus, so it comes last-but-one. */
export const TOUR_ORDER: Layer[] = ["materials", "wafers_chemicals", "equipment", "fabrication",
  "memory_packaging", "design", "systems", "power", "datacenter"];

export interface TourStep { layer: Layer; nodes: string[] }
export interface Tour { anchor: string; dir: "up" | "down"; nodes: Set<string>; flows: Set<string>; steps: TourStep[] }

/**
 * Everything upstream (dir "up") or downstream (dir "down") of an anchor, grouped by stage in walking order.
 * "up" walks from the anchor back toward raw materials; "down" walks from the anchor toward AI campuses.
 */
export function buildTour(idx: Index, anchor: string, dir: "up" | "down"): Tour {
  const { nodes, flows } = traverse(idx, [anchor], dir);
  const byLayer = new Map<Layer, string[]>();
  for (const n of nodes) {
    const l = idx.facility.get(n)?.layer;
    if (!l || !TOUR_ORDER.includes(l)) continue;
    const a = byLayer.get(l) ?? [];
    a.push(n);
    byLayer.set(l, a);
  }
  const order = dir === "down" ? TOUR_ORDER : [...TOUR_ORDER].reverse();
  const steps = order.filter((l) => byLayer.get(l)?.length)
    .map((layer) => ({ layer, nodes: byLayer.get(layer)!.sort((a, b) => (idx.reach.get(b) ?? 0) - (idx.reach.get(a) ?? 0)) }));
  return { anchor, dir, nodes, flows, steps };
}

/** Flows touching a step's sites whose other end is also on the walk. */
export function stepFlows(idx: Index, tour: Tour, step: TourStep): Flow[] {
  const here = new Set(step.nodes);
  const out: Flow[] = [];
  for (const id of tour.flows) {
    const f = idx.flow.get(id);
    if (f && (here.has(f.from_node) || here.has(f.to_node))) out.push(f);
  }
  return out;
}

// ─── Knockout analysis (single points of failure) ────────────────────────────
//
// Model: a node keeps working only if, for EVERY kind of input it takes, at least ONE recorded supplier
// of that kind still works (AND across input kinds, OR across suppliers of the same kind). Removing one
// node and propagating shows which AI campuses lose every recorded supplier of some input.
// Inputs are grouped by kind from the route's commodity text; suppliers of the same kind are treated as
// substitutes. The dataset is incomplete, so "no recorded alternative" is not "no alternative".

const INPUT_KINDS: [RegExp, string][] = [
  [/assembly, test and packaging|contract manufacturing/i, "contract manufacturing"],
  [/electric|uprate/i, "electricity"],
  [/turbine|reactor module|triso/i, "generation equipment"],
  [/ethernet|switch|infiniband|transceiver|networking/i, "networking"],
  [/euv|duv|lithograph|optical column|optical components|light source|reticle|wafer tables|drive laser|optics/i, "lithography"],
  [/equipment|cmp|metrolog|inspection|delivery subsystem|deposition|etch/i, "process tools"],
  [/hbm|dram|memory/i, "memory"],
  [/logic|\bdies?\b|soc|wafers at|foundry wafers|front-end wafers|blackwell wafers|2nm silicon/i, "logic dies"],
  [/packag|cowos|atmp|assembly and test|test services/i, "packaging"],
  [/polysilicon/i, "polysilicon"],
  [/rare earth|ndpr|mrec/i, "rare earths"],
  [/germanium|zinc and lead/i, "germanium feedstock"],
  [/fluorspar|fluor/i, "fluorspar"],
  [/resist|\bmor\b/i, "photoresist"],
  [/\bgas|nitrogen|argon|oxygen/i, "industrial gases"],
  [/chemical|materials|filtration/i, "chemicals & materials"],
  [/wafer|silicon|\bsoi\b/i, "silicon wafers"],
  [/gpu|nvl|rack|server|superchip|accelerat|trainium|xpu|mtia|maia|blackwell|hopper|rubin|gb[23]00|cloud infrastructure|\bunits\b|system components|custom ai/i, "AI compute hardware"],
  [/cpu core|\barm\b|eda|licen/i, "IP & EDA"],
];

export function inputKind(commodity: string, supplierLayer?: string): string {
  for (const [re, k] of INPUT_KINDS) if (re.test(commodity)) return k;
  return `other ${supplierLayer ?? "input"}`;
}

export interface Knockout {
  /** node → (input kind → supplier nodes). Company suppliers appear as virtual "co:x#kind" nodes. */
  inputs: Map<string, Map<string, Set<string>>>;
  /** node → campuses cut off if that node alone is removed (all counsel-approved routes, incl. inferred) */
  critical: Map<string, { dc: string; kind: string }[]>;
  /** same, using documented routes only */
  criticalDoc: Map<string, number>;
}

/** Which stages produce each input kind (used to decide which of a company's sites back a company-level route). */
const PRODUCER: Record<string, Layer[]> = {
  "logic dies": ["fabrication"], memory: ["memory_packaging", "fabrication"], packaging: ["memory_packaging"],
  lithography: ["equipment"], "process tools": ["equipment"], "AI compute hardware": ["design", "systems"],
  networking: ["systems", "design"], "contract manufacturing": ["systems"], electricity: ["power"],
  "generation equipment": ["power"], "silicon wafers": ["wafers_chemicals"], photoresist: ["wafers_chemicals"],
  "industrial gases": ["wafers_chemicals"], "chemicals & materials": ["wafers_chemicals"], polysilicon: ["materials"],
  "rare earths": ["materials"], "germanium feedstock": ["materials"], fluorspar: ["materials"], "IP & EDA": ["design"],
};

function buildInputs(idx: Index, documentedOnly: boolean) {
  const inputs = new Map<string, Map<string, Set<string>>>();
  const add = (n: string, kind: string, s: string) => {
    const g = inputs.get(n) ?? new Map<string, Set<string>>();
    const set = g.get(kind) ?? new Set<string>();
    set.add(s); g.set(kind, set); inputs.set(n, g);
  };
  const flows = idx.atlas.flows.filter((f) => !documentedOnly || f.basis === "documented");
  const virtuals = new Map<string, { co: string; kind: string }>();
  const supplierOf = (f: Flow, kind: string) => {
    if (!idx.company.has(f.from_node)) return f.from_node;
    const v = `${f.from_node}#${kind}`;
    virtuals.set(v, { co: f.from_node, kind });
    return v;
  };
  // Documented routes define what a node requires. An inferred route may add an alternative supplier, or
  // describe a node with no documented inputs at all, but never adds a new requirement to a documented node
  // (one inferred link must not turn a well-documented company into a single point of failure).
  const documentedTo = new Set(flows.filter((f) => f.basis === "documented").map((f) => f.to_node));
  for (const f of [...flows].sort((a, b) => Number(a.basis === "inferred") - Number(b.basis === "inferred"))) {
    const kind = inputKind(f.commodity, nodeLayer(idx, f.from_node));
    if (f.basis === "inferred" && documentedTo.has(f.to_node) && !inputs.get(f.to_node)?.has(kind)) continue;
    add(f.to_node, kind, supplierOf(f, kind));
  }
  // Documented requirements (linkage round) are hard needs, e.g. "this fab needs EUV; ASML is the only maker".
  for (const r of idx.atlas.requirements ?? []) {
    // Only fully verified requirements create hard dependencies; flagged ones are shown but don't feed the analysis.
    if (r.review !== "verified") continue;
    for (const sup of r.suppliers) {
      if (idx.company.has(sup)) { const v = `${sup}#${r.kind}`; virtuals.set(v, { co: sup, kind: r.kind }); add(r.node, r.kind, v); }
      else add(r.node, r.kind, sup);
    }
  }
  // A company-level supplier of kind K works while at least one of the company's K-producing sites works,
  // and while its own company-level inputs are satisfied.
  for (const [v, { co, kind }] of virtuals) {
    const sites = idx.facilitiesByOperator.get(co) ?? [];
    const producers = sites.filter((f) => (PRODUCER[kind] ?? []).includes(f.layer));
    for (const f of producers.length ? producers : sites) add(v, "own sites", f.id);
    for (const [k, set] of inputs.get(co) ?? []) for (const x of set) add(v, k, x);
    if (!inputs.has(v)) inputs.set(v, new Map());
  }
  return { inputs, virtuals };
}

export function buildKnockout(idx: Index): Knockout {
  const dcs = idx.atlas.facilities.filter((f) => f.layer === "datacenter").map((f) => f.id);
  const run = (documentedOnly: boolean) => {
    const { inputs, virtuals } = buildInputs(idx, documentedOnly);
    const candidates = new Set<string>();
    for (const g of inputs.values()) for (const set of g.values()) for (const x of set) candidates.add(x.split("#")[0]);
    const out = new Map<string, { dc: string; kind: string }[]>();
    for (const x of candidates) {
      const removed = new Set([x]);
      for (const [v, { co }] of virtuals) if (co === x) removed.add(v); // removing a company removes its virtual suppliers
      const { dead, cause } = knockout(inputs, removed);
      const hit = dcs.filter((d) => dead.has(d) && d !== x).map((d) => ({ dc: d, kind: cause.get(d)! }));
      if (hit.length) out.set(x, hit);
    }
    return { inputs, out };
  };
  const all = run(false);
  const doc = run(true);
  return { inputs: all.inputs, critical: all.out, criticalDoc: new Map([...doc.out].map(([k, v]) => [k, v.length])) };
}

/** Remove `removed`, propagate failures to a fixpoint. Returns dead nodes and, for each, the input kind that ran out. */
export function knockout(inputs: Knockout["inputs"], removed: Set<string>) {
  const dead = new Set(removed);
  const cause = new Map<string, string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [n, groups] of inputs) {
      if (dead.has(n)) continue;
      for (const [kind, sup] of groups) {
        let alive = false;
        for (const s of sup) if (!dead.has(s)) { alive = true; break; }
        if (!alive) { dead.add(n); cause.set(n, kind); changed = true; break; }
      }
    }
  }
  return { dead, cause };
}

/** Campuses that lose every recorded supplier of some input when `nodes` are removed (company removal includes its virtual suppliers). */
export function cutOff(idx: Index, nodes: string[]) {
  const removed = new Set(nodes);
  for (const k of idx.ko.inputs.keys()) if (k.includes("#") && removed.has(k.split("#")[0])) removed.add(k);
  const { dead, cause } = knockout(idx.ko.inputs, removed);
  return idx.atlas.facilities.filter((f) => f.layer === "datacenter" && dead.has(f.id) && !removed.has(f.id))
    .map((f) => ({ dc: f.id, kind: cause.get(f.id) ?? "" }));
}
