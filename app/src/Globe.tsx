import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL, { type DeckGLRef } from "@deck.gl/react";
import { _GlobeView as GlobeView, LinearInterpolator, type PickingInfo, type GlobeViewState } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import { SphereGeometry } from "@luma.gl/engine";
import { COORDINATE_SYSTEM } from "@deck.gl/core";
import { PathStyleExtension, type PathStyleExtensionProps } from "@deck.gl/extensions";
import type { Feature, Geometry } from "geojson";
import {
  type Index, type Facility, type Flow, type FinancialLink, type Control,
  traverse, locateAny, usdValue, ctlEffect, nodeName, CHAIN,
} from "./atlas";
import { arcPath, graticule, offsetEast, type World, type Country } from "./geo";
import { C, LAYER_COLOR } from "./theme";
import { useStore } from "./store";
import { useTourFocus } from "./ui/Tour";
import { useStoryFocus } from "./ui/Story";

type RGB = [number, number, number];
type RGBA = [number, number, number, number];
const rgba = (c: RGB, a: number): RGBA => [c[0], c[1], c[2], Math.round(a)];

const isTouch = typeof window !== "undefined" && matchMedia("(pointer: coarse)").matches;
const VIEW = new GlobeView({ id: "globe", resolution: 5 });
// Size the globe to ~38% of the short viewport edge (radius ≈ 170 px at zoom 1.05 on a 950 px-tall viewport).
const fitZoom = () => 1.05 + Math.log2((0.4 * Math.min(window.innerWidth, window.innerHeight - 90)) / 170);
const INITIAL = { longitude: -168, latitude: 28, zoom: fitZoom(), minZoom: 0.4, maxZoom: 9 };
// Ocean: a mesh sphere a hair under Earth's radius, so tessellated land polygons never z-fight with it.
const OCEAN_MESH = new SphereGeometry({ radius: 6.36e6, nlat: 48, nlong: 96 });
const GRATICULE = graticule(20);
/** One-tap camera presets: [label, lon, lat, zoom]. */
const REGIONS: [string, number, number, number][] = [
  ["Pacific", -168, 28, 1.6], ["US", -97, 38, 2.5], ["East Asia", 124, 30, 2.5], ["Europe", 8, 50, 2.7],
];
const DASH = new PathStyleExtension({ dash: true, highPrecisionDash: true });

interface ArcDatum { id: string; path: [number, number, number][]; ts: number[]; color: RGB; width: number; dashed: boolean; kind: string }

/** Cache arc geometry per id — endpoints never move, only styling does. */
const pathCache = new Map<string, { path: [number, number, number][]; ts: number[] }>();
function arcFor(id: string, a: [number, number], b: [number, number], lift: number) {
  let hit = pathCache.get(id);
  if (!hit) {
    const path = arcPath(a, b, lift);
    const phase = hashPhase(id);
    hit = { path, ts: path.map((_, i) => phase + (i / (path.length - 1)) * 1.6) };
    pathCache.set(id, hit);
  }
  return hit;
}
function hashPhase(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 * 1.4;
}

export function activeControls(idx: Index, at: number): Control[] {
  return idx.atlas.controls.filter((c) => {
    const span = idx.controlSpan.get(c.id);
    return span && span[0] <= at && at < span[1] && c.status !== "proposed";
  });
}

export default function Globe({ idx, world }: { idx: Index; world: World }) {
  const s = useStore();
  const deckRef = useRef<DeckGLRef>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const [viewState, setViewState] = useState<Record<string, unknown>>(INITIAL);
  const [time, setTime] = useState(0);
  const idleSpin = useRef(true);
  // Trackball drag: horizontal → longitude, vertical → latitude, scaled so the surface under the
  // cursor tracks the pointer near the globe's centre. Replaces deck's "grab a point" globe pan,
  // which swings the globe at odd angles when dragging near the limb or at high latitude.
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const vel = useRef<[number, number]>([0, 0]);
  const radiusPx = useRef(300);
  const touches = useRef(new Set<number>());
  const stopSpin = () => { idleSpin.current = false; };
  const zoomBy = (dz: number) => {
    stopSpin();
    setViewState((v) => ({ ...v, zoom: Math.max(0.4, Math.min(9, (v.zoom as number) + dz)),
      transitionDuration: 300, transitionInterpolator: new LinearInterpolator(["zoom"]) }));
  };

  // ── animation clock (drives pulses + idle rotation) ──
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((now / 1000) % 3.2);
      if (idleSpin.current) setViewState((v) => ({ ...v, longitude: ((v.longitude as number) + dt * 2.2 + 540) % 360 - 180, transitionDuration: 0 }));
      else if (!drag.current && (Math.abs(vel.current[0]) > 0.02 || Math.abs(vel.current[1]) > 0.02)) {
        const [vx, vy] = vel.current;               // deg per frame, decays like a flywheel
        vel.current = [vx * 0.9, vy * 0.9];
        setViewState((v) => rotate(v, vx, vy));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── fly-to requests from anywhere in the UI ──
  useEffect(() => {
    if (!s.flyTo) return;
    idleSpin.current = false;
    setViewState((v) => {
      const cur = v.longitude as number;
      let lon = s.flyTo!.lon;
      while (lon - cur > 180) lon -= 360;
      while (lon - cur < -180) lon += 360;
      return {
        ...v, longitude: lon, latitude: s.flyTo!.lat, zoom: s.flyTo!.zoom ?? Math.max(v.zoom as number, 2.2),
        transitionDuration: 1400, transitionInterpolator: new LinearInterpolator(["longitude", "latitude", "zoom"]),
      };
    });
  }, [s.flyTo]);

  // ── bring a selected rule's target (or a deep-linked entity) into view ──
  const firstSel = useRef(true);
  useEffect(() => {
    const id = s.selected;
    if (!id) return;
    const c = idx.control.get(id);
    let p: [number, number] | undefined;
    if (c) p = c.applies_to.map((a) => world.byA2.get(a)?.centroid).find(Boolean) ?? c.applies_from.map((a) => world.byA2.get(a)?.centroid).find(Boolean);
    else if (firstSel.current) p = locateAny(idx, idx.flow.get(id)?.to_node ?? idx.fin.get(id)?.to ?? id);
    firstSel.current = false;
    if (p) s.focus(p[0], p[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.selected]);

  // ── what-if: severed nodes (sites, or whole countries) and their downstream exposure ──
  const severedNodes = useMemo(() => {
    const out: string[] = [];
    for (const id of s.severed) {
      if (id.startsWith("country:")) {
        const cc = id.slice(8);
        for (const f of idx.atlas.facilities) if (f.country === cc) out.push(f.id);
      } else out.push(id);
    }
    return out;
  }, [s.severed, idx]);
  const exposure = useMemo(() => severedNodes.length ? traverse(idx, severedNodes, "down") : null, [severedNodes, idx]);
  const severedSet = useMemo(() => new Set(severedNodes), [severedNodes]);

  // ── trace: full upstream + downstream chain of the selection ──
  const trace = useMemo(() => {
    if (!s.trace || !s.selected) return null;
    if (!idx.facility.has(s.selected) && !idx.company.has(s.selected)) return null;
    return traverse(idx, [s.selected], "both");
  }, [s.trace, s.selected, idx]);

  const tourFocus = useTourFocus(idx);
  const storyFocus = useStoryFocus(idx);
  const guide = storyFocus ?? tourFocus;
  const focus = guide ?? trace ?? exposure; // null → everything at full strength

  // Fly to each walk step: centre on the stage's sites, zoom by how spread out they are.
  useEffect(() => {
    if (!guide) return;
    const ctlPts = (storyFocus?.controls ?? []).flatMap((id) => idx.control.get(id)!.applies_to.map((a) => world.byA2.get(a)?.centroid)).filter(Boolean) as [number, number][];
    const pts = [...[...guide.stepNodes].map((n) => locateAny(idx, n)).filter(Boolean) as [number, number][], ...ctlPts];
    if (!pts.length) return;
    // Frame the densest cluster (sites within 35° of the best-connected site), not the global mean:
    // the mean of US + Asian sites lands in the Arctic.
    const near = (a: [number, number], b: [number, number]) => angularDist(a[0], a[1], b[0], b[1]) < 35;
    const seed = pts.reduce((best, p) => (pts.filter((q) => near(p, q)).length > pts.filter((q) => near(best, q)).length ? p : best), pts[0]);
    const cluster = pts.filter((q) => near(seed, q));
    const r = Math.PI / 180;
    let x = 0, y = 0, z = 0;
    for (const [lo, la] of cluster) { x += Math.cos(la * r) * Math.cos(lo * r); y += Math.cos(la * r) * Math.sin(lo * r); z += Math.sin(la * r); }
    const lon = Math.atan2(y, x) / r, lat = Math.atan2(z, Math.hypot(x, y)) / r;
    const spread = Math.max(...cluster.map(([lo, la]) => angularDist(lo, la, lon, lat)));
    const zoom = spread < 6 ? 3.4 : spread < 18 ? 2.6 : spread < 40 ? 2.0 : 1.5;
    // On phones the step card covers the lower half: aim the camera south of the sites so they sit above it.
    const small = window.innerWidth < 700;
    const zf = small ? zoom - 0.4 : zoom;
    s.focus(lon, small ? Math.max(-70, lat - 22 / 2 ** (zf - 1.5)) : lat, zf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide]);
  const inFocusNode = (id: string) => !focus || focus.nodes.has(id);
  const inFocusFlow = (id: string) => !focus || focus.flows.has(id);

  // ── filters ──
  const facVisible = (f: Facility) =>
    s.layers.has(f.layer)
    && (s.showFlagged || f.review === "verified")
    && (s.showPlanned || !["announced", "planned"].includes(f.status))
    && f.status !== "cancelled";
  const facilities = useMemo(() => idx.atlas.facilities.filter(facVisible),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idx, s.layers, s.showFlagged, s.showPlanned]);

  const flowVisible = (f: Flow) => {
    const toL = idx.facility.get(f.to_node)?.layer ?? f.layer;
    const fromL = idx.facility.get(f.from_node)?.layer ?? f.layer;
    return (s.layers.has(toL) || s.layers.has(fromL))
      && (s.showInferred || f.basis === "documented")
      && (s.showFlagged || f.review === "verified");
  };

  const flowArcs: ArcDatum[] = useMemo(() => {
    const out: ArcDatum[] = [];
    for (const f of idx.atlas.flows) {
      if (!flowVisible(f)) continue;
      const a = locateAny(idx, f.from_node), b = locateAny(idx, f.to_node);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      const g = arcFor(f.id, a, b, 0.2);
      const toL = idx.facility.get(f.to_node)?.layer ?? f.layer;
      out.push({ id: f.id, ...g, color: LAYER_COLOR[toL] ?? C.accent, width: 1, dashed: f.basis === "inferred", kind: "flow" });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, s.layers, s.showInferred, s.showFlagged]);

  const finArcs: ArcDatum[] = useMemo(() => {
    const out: ArcDatum[] = [];
    for (const f of idx.atlas.financial_links) {
      if (f.from === f.to) continue;
      if (!s.showFlagged && f.review !== "verified") continue;
      const a = locateAny(idx, f.from), b = locateAny(idx, f.to);
      if (!a || !b || (a[0] === b[0] && a[1] === b[1])) continue;
      const g = arcFor(`fin|${f.id}`, a, b, 0.32);
      const usd = usdValue(f.amount);
      const width = usd ? Math.max(1, Math.min(7, Math.log10(usd) - 7.2)) : 1;
      out.push({ id: f.id, ...g, color: finColor(f), width, dashed: !f.amount, kind: "fin" });
    }
    return out;
  }, [idx, s.showFlagged]);

  // ── controls choropleth for the scrubbed date ──
  const ctl = useMemo(() => {
    const inBloc = (c: Control) => s.ctlBloc === "all" || (s.ctlBloc === "cn") === c.authority.startsWith("CN");
    const all = activeControls(idx, s.controlDate).filter(inBloc);
    const listings = all.filter((c) => ctlEffect(c) === "entities");
    const active = all.filter((c) => ctlEffect(c) === "restrict");
    const target = new Map<string, number>();
    const source = new Map<string, number>();
    const routes = new Map<string, { from: string; to: string; ids: string[] }>();
    for (const c of active) {
      for (const cc of c.applies_to) if (/^[A-Z]{2}$/.test(cc)) target.set(cc, (target.get(cc) ?? 0) + 1);
      for (const cc of c.applies_from) if (/^[A-Z]{2}$/.test(cc)) source.set(cc, (source.get(cc) ?? 0) + 1);
      for (const fr of c.applies_from) for (const to of c.applies_to) {
        if (!/^[A-Z]{2}$/.test(fr) || !/^[A-Z]{2}$/.test(to) || fr === to) continue;
        const k = `${fr}>${to}`;
        const r = routes.get(k) ?? { from: fr, to, ids: [] };
        r.ids.push(c.id);
        routes.set(k, r);
      }
    }
    return { active, listings, target, source, routes: [...routes.values()] };
  }, [idx, s.controlDate, s.ctlBloc]);

  const ctlArcs: (ArcDatum & { mid: [number, number, number]; route: { from: string; to: string; ids: string[] } })[] = useMemo(() => {
    const out = [];
    for (const r of ctl.routes) {
      const a = world.byA2.get(r.from)?.centroid, b = world.byA2.get(r.to)?.centroid;
      if (!a || !b) continue;
      const g = arcFor(`ctl|${r.from}>${r.to}`, a, b, 0.26);
      out.push({ id: `${r.from}>${r.to}`, ...g, color: C.danger, width: Math.min(5, 1 + r.ids.length * 0.5), dashed: true, kind: "ctlroute", mid: g.path[Math.floor(g.path.length / 2)], route: r });
    }
    return out;
  }, [ctl, world]);

  // ── node sizing: chokepoint reach ──
  const maxReach = useMemo(() => Math.max(1, ...idx.reach.values()), [idx]);
  const radiusOf = (id: string) => 3 + 7 * Math.sqrt((idx.reach.get(id) ?? 0) / maxReach);

  const capitalNodes = useMemo(() => {
    const vol = new Map<string, number>();
    for (const f of idx.atlas.financial_links) {
      const v = usdValue(f.amount) || 1e8;
      vol.set(f.from, (vol.get(f.from) ?? 0) + v);
      vol.set(f.to, (vol.get(f.to) ?? 0) + v);
    }
    return [...vol.entries()].map(([id, v]) => ({ id, pos: locateAny(idx, id), v })).filter((n) => n.pos);
  }, [idx]);

  // Self-links (capex, lease backlogs, commitments to unnamed counterparties) have no second endpoint;
  // draw them as rings at the company, radius ∝ log of the total disclosed USD.
  const selfRings = useMemo(() => {
    const m = new Map<string, { id: string; pos: [number, number]; usd: number; n: number }>();
    for (const f of idx.atlas.financial_links) {
      if (f.from !== f.to || (!s.showFlagged && f.review !== "verified")) continue;
      const pos = locateAny(idx, f.from);
      if (!pos) continue;
      const r = m.get(f.from) ?? { id: f.from, pos, usd: 0, n: 0 };
      r.usd += usdValue(f.amount); r.n++;
      m.set(f.from, r);
    }
    return [...m.values()];
  }, [idx, s.showFlagged]);

  const mode = s.mode;
  const dim = (on: boolean, a: number) => (on ? a : a * 0.12);
  const selectedFlowIds = new Set<string>();
  if (s.selected) {
    for (const f of idx.out.get(s.selected) ?? []) selectedFlowIds.add(f.id);
    for (const f of idx.in.get(s.selected) ?? []) selectedFlowIds.add(f.id);
  }

  const onHover = (info: PickingInfo) => {
    const o = info.object as { id?: string; route?: unknown; a2?: string } | undefined;
    if (!o) { if (s.hover) s.set({ hover: null }); return; }
    const id = o.id ?? (o.a2 ? `country:${o.a2}` : undefined);
    if (id && (s.hover?.id !== id || Math.abs(s.hover.x - info.x) > 2 || Math.abs(s.hover.y - info.y) > 2))
      s.set({ hover: { id, kind: info.layer?.id ?? "", x: info.x, y: info.y } });
  };
  const onClick = (info: PickingInfo) => {
    idleSpin.current = false;
    const o = info.object as { id?: string; a2?: string; route?: { ids: string[] } } | undefined;
    if (!o) { s.select(null); return; }
    if (o.route) { s.select(o.route.ids[0]); return; }
    if (o.a2) { if (mode === "controls") s.select(`country:${o.a2}`); return; }
    if (o.id) s.select(o.id);
  };

  const countryFill = (c: Country): RGBA => {
    if (s.severed.has(`country:${c.a2}`)) return rgba(C.danger, 110);
    if (mode === "controls" && c.a2) {
      const t = ctl.target.get(c.a2);
      if (t) return rgba(C.danger, 55 + Math.min(120, t * 14));
      const f = ctl.source.get(c.a2);
      if (f) return rgba(C.accent, 45 + Math.min(90, f * 10));
    }
    return rgba(C.land, 255);
  };

  // ── Stable data arrays: deck.gl diffs by reference, so anything rebuilt per render is
  //    re-uploaded (and countries re-tessellated) every animation frame. Build each once per real change.
  const countryData = useMemo(() => world.countries.map((c) => ({ ...c.feature, a2: c.a2, name: c.name, country: c })) as unknown as Feature<Geometry>[], [world]);
  const pulseData = useMemo(() => flowArcs.filter((d) => inFocusFlow(d.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flowArcs, focus]);
  const hoverId = s.hover?.id;
  const haloData = useMemo(() => facilities.filter((f) => f.id === s.selected || severedSet.has(f.id) || f.id === hoverId),
    [facilities, s.selected, severedSet, hoverId]);
  const zoomTier = (viewState.zoom as number) < 1.4 ? 1 : (viewState.zoom as number) < 2.2 ? 2 : (viewState.zoom as number) < 3.2 ? 3 : 4;
  const camLon = Math.round((viewState.longitude as number) / 8) * 8;
  const camLat = Math.round((viewState.latitude as number) / 8) * 8;
  const labelData = useMemo(() => {
    const facing = facilities.filter((f) => angularDist(f.location.lon, f.location.lat, camLon, camLat) < 68);
    return labelSet(facing, idx, s.selected, hoverId, focus?.nodes, [0, 1.2, 2, 3, 4][zoomTier]);
  }, [facilities, idx, s.selected, hoverId, focus, zoomTier, camLon, camLat]);
  const capitalLabelData = useMemo(() => [...capitalNodes].sort((a, b) => b.v - a.v).slice(0, 18), [capitalNodes]);
  const listedData = useMemo(() => [...new Set([...ctl.active, ...ctl.listings].flatMap((c) => c.entities ?? []))]
    .map((id) => ({ id, pos: locateAny(idx, id)! })).filter((d) => d.pos), [ctl, idx]);

  // HTML label overlay (crisp fonts, clickable). Positions are written straight to the DOM each frame.
  const overlay: { id: string; text: string; lon: number; lat: number; dx: number; strong: boolean }[] = useMemo(() => {
    if (mode === "network") return [...labelData].sort((a, b) => Number(b.id === s.selected) - Number(a.id === s.selected)).map((f) => ({ id: f.id, text: f.name, lon: f.location.lon, lat: f.location.lat, dx: radiusOf(f.id) + 6, strong: f.id === s.selected }));
    if (mode === "capital") return capitalLabelData.map((d) => ({ id: d.id, text: idx.company.get(d.id)?.name ?? nodeName(idx, d.id), lon: d.pos![0], lat: d.pos![1], dx: 12, strong: d.id === s.selected }));
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, labelData, capitalLabelData, s.selected, idx]);
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const labelsRef = useRef<HTMLDivElement>(null);

  const layers = [
    new SimpleMeshLayer({
      id: "ocean", data: [0], mesh: OCEAN_MESH, coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: [0, 0, 0], getColor: rgba(C.ocean, 255),
      // flat, unlit: a matte instrument surface, no specular hot-spot
      material: { ambient: 1, diffuse: 0, shininess: 0, specularColor: [0, 0, 0] },
    }),
    new PathLayer({
      id: "graticule", data: GRATICULE, getPath: (d: [number, number][]) => d,
      getColor: rgba(C.graticule, 150), widthMinPixels: 0.6, widthUnits: "pixels", getWidth: 0.6,
    }),
    new GeoJsonLayer<unknown>({
      id: "countries",
      data: countryData,
      filled: true, stroked: false, pickable: mode === "controls",
      getFillColor: ((d: { country: Country }) => countryFill(d.country)) as unknown as RGBA,
      updateTriggers: { getFillColor: [mode, ctl, s.severed] },
      transitions: { getFillColor: 350 },
      // expose a2 on picking
      onHover: (info: PickingInfo) => onHover({ ...info, object: info.object ? { a2: (info.object as { a2?: string }).a2 } : undefined } as PickingInfo),
      onClick: (info: PickingInfo) => onClick({ ...info, object: info.object ? { a2: (info.object as { a2?: string }).a2 } : undefined } as PickingInfo),
    }),
    new PathLayer({
      id: "borders", data: world.borders.coordinates, getPath: (d: number[][]) => d as [number, number][],
      getColor: rgba(C.border, 255), getWidth: 0.7, widthUnits: "pixels",
    }),
    new PathLayer({
      id: "coast", data: world.coastline.coordinates, getPath: (d: number[][]) => d as [number, number][],
      getColor: rgba([62, 78, 96], 255), getWidth: 0.9, widthUnits: "pixels",
    }),

    // ─── NETWORK ───
    ...(mode === "network" ? [
      new PathLayer<ArcDatum, PathStyleExtensionProps<ArcDatum>>({
        id: "flows", data: flowArcs, pickable: true, getPath: (d) => d.path,
        getColor: (d) => rgba(d.color, selectedFlowIds.has(d.id) ? 255 : dim(inFocusFlow(d.id), d.dashed ? 120 : 150)),
        getWidth: (d) => (selectedFlowIds.has(d.id) ? 3 : focus && inFocusFlow(d.id) ? 2.2 : 1.2),
        widthUnits: "pixels", widthMinPixels: 1,
        getDashArray: (d) => (d.dashed ? [5, 4] : [0, 0]), dashJustified: true, extensions: [DASH],
        updateTriggers: { getColor: [focus, s.selected], getWidth: [focus, s.selected] },
        onHover, onClick,
      }),
      new TripsLayer<ArcDatum>({
        id: "flow-pulses", data: pulseData,
        getPath: (d) => d.path, getTimestamps: (d) => d.ts,
        getColor: (d) => (exposure?.flows.has(d.id) ? C.danger : ([Math.min(255, d.color[0] + 60), Math.min(255, d.color[1] + 60), Math.min(255, d.color[2] + 60)] as RGB)),
        opacity: 0.95, widthMinPixels: 2.4, getWidth: 2.4, widthUnits: "pixels",
        trailLength: 0.32, currentTime: time, fadeTrail: true, capRounded: true, jointRounded: true,
        updateTriggers: { getColor: [exposure] },
      }),
      new ScatterplotLayer<Facility>({
        id: "facility-halo", data: haloData,
        getPosition: (f) => [f.location.lon, f.location.lat, 12_000],
        getRadius: (f) => radiusOf(f.id) + 7, radiusUnits: "pixels",
        getFillColor: (f) => rgba(severedSet.has(f.id) ? C.danger : LAYER_COLOR[f.layer], 50),
        getLineColor: (f) => rgba(severedSet.has(f.id) ? C.danger : C.text, 230),
        stroked: true, lineWidthUnits: "pixels", getLineWidth: 1.2,
        updateTriggers: { getFillColor: [severedSet], getLineColor: [severedSet] },
      }),
      new ScatterplotLayer<Facility>({
        id: "facilities", data: facilities, pickable: true,
        getPosition: (f) => [f.location.lon, f.location.lat, 10_000],
        getRadius: (f) => radiusOf(f.id), radiusUnits: "pixels", radiusMinPixels: 2.5,
        getFillColor: (f) => rgba(exposure?.nodes.has(f.id) && !severedSet.has(f.id) ? C.warn : severedSet.has(f.id) ? C.danger : LAYER_COLOR[f.layer],
          dim(inFocusNode(f.id), ["announced", "planned", "under_construction"].includes(f.status) ? 150 : 245)),
        stroked: true, lineWidthUnits: "pixels", getLineWidth: (f) => (f.review === "verified" ? 0.8 : 1.4),
        getLineColor: (f) => (f.review === "verified" ? rgba([10, 12, 16], 200) : rgba(C.warn, dim(inFocusNode(f.id), 230))),
        updateTriggers: { getFillColor: [focus, exposure, severedSet], getLineColor: [focus] },
        transitions: { getFillColor: 300 },
        onHover, onClick,
      }),
    ] : []),

    // ─── CAPITAL ───
    ...(mode === "capital" ? [
      new PathLayer<ArcDatum, PathStyleExtensionProps<ArcDatum>>({
        id: "fin-arcs", data: finArcs, pickable: true, getPath: (d) => d.path,
        getColor: (d) => rgba(d.color, d.id === s.selected ? 255 : s.selected ? 70 : 150),
        getWidth: (d) => d.width + (d.id === s.selected ? 2 : 0), widthUnits: "pixels",
        getDashArray: (d) => (d.dashed ? [4, 4] : [0, 0]), extensions: [DASH],
        updateTriggers: { getColor: [s.selected], getWidth: [s.selected] }, onHover, onClick,
      }),
      new TripsLayer<ArcDatum>({
        id: "fin-pulses", data: finArcs, getPath: (d) => d.path, getTimestamps: (d) => d.ts,
        getColor: (d) => [Math.min(255, d.color[0] + 40), Math.min(255, d.color[1] + 40), Math.min(255, d.color[2] + 40)],
        getWidth: (d) => d.width + 1, widthUnits: "pixels", trailLength: 0.4, currentTime: time, fadeTrail: true, capRounded: true,
      }),
      new ScatterplotLayer<{ id: string; pos: [number, number]; usd: number; n: number }>({
        id: "capital-self", data: selfRings, pickable: true,
        getPosition: (d) => [d.pos[0], d.pos[1], 9_000],
        getRadius: (d) => (d.usd ? Math.max(8, Math.min(34, (Math.log10(d.usd) - 8) * 7)) : 8), radiusUnits: "pixels",
        filled: true, getFillColor: rgba([70, 206, 180], 18), stroked: true,
        getLineColor: rgba([70, 206, 180], 170), lineWidthUnits: "pixels", getLineWidth: 1.2,
        onHover, onClick,
      }),
      new ScatterplotLayer<{ id: string; pos?: [number, number]; v: number }>({
        id: "capital-nodes", data: capitalNodes, pickable: true,
        getPosition: (d) => [d.pos![0], d.pos![1], 10_000],
        getRadius: (d) => Math.max(3, Math.min(16, Math.log10(d.v) * 2.4 - 16)), radiusUnits: "pixels",
        getFillColor: (d) => (d.id.startsWith("gov:") ? rgba(C.accent, 230) : rgba(C.gold, 220)),
        stroked: true, getLineColor: [10, 12, 16, 220], lineWidthUnits: "pixels", getLineWidth: 1,
        onHover, onClick,
      }),
    ] : []),

    // ─── CONTROLS ───
    ...(mode === "controls" ? [
      new ScatterplotLayer<Facility>({
        id: "facilities-muted", data: facilities, pickable: true,
        getPosition: (f) => [f.location.lon, f.location.lat, 10_000], getRadius: 2.5, radiusUnits: "pixels",
        getFillColor: (f) => rgba(LAYER_COLOR[f.layer], 110), onHover, onClick,
      }),
      new PathLayer<(typeof ctlArcs)[number], PathStyleExtensionProps<(typeof ctlArcs)[number]>>({
        id: "ctl-routes", data: ctlArcs, pickable: true, getPath: (d) => d.path,
        getColor: rgba(C.danger, 210), getWidth: (d) => d.width, widthUnits: "pixels",
        getDashArray: [6, 4], extensions: [DASH], onHover, onClick,
      }),
      new ScatterplotLayer<(typeof ctlArcs)[number]>({
        id: "ctl-x", data: ctlArcs, pickable: true, getPosition: (d) => d.mid, getRadius: 5, radiusUnits: "pixels",
        getFillColor: [20, 8, 10, 230], stroked: true, getLineColor: rgba(C.danger, 255), lineWidthUnits: "pixels", getLineWidth: 2,
        parameters: { depthCompare: "always" }, onHover, onClick,
      }),
      new ScatterplotLayer<{ id: string; pos: [number, number] }>({
        id: "listed-entities", pickable: true,
        data: listedData,
        getPosition: (d) => [d.pos[0], d.pos[1], 12_000], getRadius: 6, radiusUnits: "pixels",
        getFillColor: rgba(C.danger, 230), stroked: true, getLineColor: [255, 255, 255, 220], lineWidthUnits: "pixels", getLineWidth: 1.2,
        onHover, onClick,
      }),
    ] : []),
  ];

  // Globe halo: measure the globe's on-screen radius after each render and size a CSS glow to it.
  const onPointerDown = (e: React.PointerEvent) => {
    stopSpin();
    if ((e.target as HTMLElement).closest("button, a, input")) return;
    touches.current.add(e.pointerId);
    if (touches.current.size > 1) { drag.current = null; return; } // two fingers: let pinch-zoom work
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    vel.current = [0, 0];
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || touches.current.size > 1) return;
    const degPerPx = 180 / Math.PI / Math.max(60, radiusPx.current);
    const dLon = -(e.clientX - d.x) * degPerPx, dLat = (e.clientY - d.y) * degPerPx;
    const now = performance.now(), dt = Math.max(1, now - d.t);
    vel.current = [dLon * 16 / dt, dLat * 16 / dt];
    drag.current = { x: e.clientX, y: e.clientY, t: now };
    setViewState((v) => rotate(v, dLon, dLat));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    touches.current.delete(e.pointerId);
    if (drag.current && performance.now() - drag.current.t > 80) vel.current = [0, 0]; // paused before release: no fling
    drag.current = null;
  };

  const onAfterRender = () => {
    const vp = deckRef.current?.deck?.getViewports()[0];
    const box = labelsRef.current;
    if (vp && box) {
      const lon0 = viewState.longitude as number, lat0 = viewState.latitude as number;
      const els = box.children as HTMLCollectionOf<HTMLElement>;
      // Greedy de-overlap: labels arrive in priority order (selection, then reach); a label that would
      // collide with one already placed is hidden. Zooming in spreads sites apart and reveals more.
      const placed: [number, number, number, number][] = [];
      const cw = window.innerWidth < 700 ? 6.2 : 6.9;
      overlayRef.current.forEach((l, i) => {
        const el = els[i];
        if (!el) return;
        const hide = () => { el.style.opacity = "0"; el.style.pointerEvents = "none"; };
        const d = angularDist(l.lon, l.lat, lon0, lat0);
        if (d > 80) return hide();
        const [px, py] = vp.project([l.lon, l.lat, 40_000]);
        const x = px + l.dx, w = Math.min(window.innerWidth < 700 ? 150 : 240, l.text.length * cw + 10), h = 17;
        const box2: [number, number, number, number] = [x, py - h / 2, x + w, py + h / 2];
        if (!l.strong && placed.some((b) => box2[0] < b[2] && box2[2] > b[0] && box2[1] < b[3] && box2[3] > b[1])) return hide();
        placed.push(box2);
        el.style.transform = `translate(${x}px, ${py}px) translateY(-50%)`;
        el.style.opacity = d > 70 ? String((80 - d) / 10) : "1";
        el.style.pointerEvents = "auto";
      });
    }
    const el = haloRef.current;
    if (!vp || !el) return;
    const lon = viewState.longitude as number, lat = viewState.latitude as number;
    const c = vp.project([lon, lat, 0]);
    const e = vp.project([...offsetEast(lon, lat, 89.5), 0]);
    const r = Math.hypot(e[0] - c[0], e[1] - c[1]);
    el.style.setProperty("--r", `${r}px`);
    radiusPx.current = r;
    el.dataset.view = `${lon.toFixed(2)},${lat.toFixed(2)}`; // test hook: current camera centre
    el.style.setProperty("--cx", `${c[0]}px`);
    el.style.setProperty("--cy", `${c[1]}px`);
  };

  return (
    <div className="globe-wrap" onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp} onWheel={stopSpin}>
      <div className="halo" ref={haloRef} />
      <div className="labels" ref={labelsRef} aria-hidden="true">
        {overlay.map((l) => (
          <button key={l.id} className={`glabel${l.strong ? " strong" : ""}`} tabIndex={-1}
            onClick={() => { stopSpin(); s.select(l.id); }} onPointerEnter={() => s.set({ hover: null })}>{l.text}</button>
        ))}
      </div>
      <div className="camera" role="group" aria-label="Camera">
        <div className="cam-regions">
          {REGIONS.map(([label, lon, lat, zoom]) => (
            <button key={label} onClick={() => s.focus(lon, lat, window.innerWidth < 700 ? zoom - 0.5 : zoom)} title={`Fly to ${label}`}>{label}</button>
          ))}
        </div>
        <div className="cam-zoom">
          <button aria-label="Zoom in" onClick={() => zoomBy(0.6)}>+</button>
          <button aria-label="Zoom out" onClick={() => zoomBy(-0.6)}>−</button>
          <button aria-label="Reset view" title="Reset view" onClick={() => { stopSpin(); setViewState((v) => ({ ...v, ...INITIAL, transitionDuration: 900, transitionInterpolator: new LinearInterpolator(["longitude", "latitude", "zoom"]) })); }}>⟲</button>
        </div>
      </div>
      <DeckGL
        ref={deckRef}
        views={VIEW}
        viewState={viewState as unknown as GlobeViewState}
        controller={{ dragPan: false, dragRotate: false, inertia: false, scrollZoom: { speed: 0.012, smooth: false },
          touchZoom: true, touchRotate: false, doubleClickZoom: true, keyboard: true }}
        pickingRadius={isTouch ? 14 : 6}
        onViewStateChange={({ viewState: v, interactionState }) => {
          if (interactionState?.isDragging || interactionState?.isZooming || interactionState?.isPanning) idleSpin.current = false;
          setViewState(v as Record<string, unknown>);
        }}
        layers={layers}
        onAfterRender={onAfterRender}
        getCursor={({ isHovering, isDragging }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab")}
        onClick={(info) => { if (!info.object) onClick(info); }}
        useDevicePixels={isTouch ? 1.5 : Math.min(2, window.devicePixelRatio)}
      />
    </div>
  );
}

function finColor(f: FinancialLink): RGB {
  if (f.from.startsWith("gov:")) return [96, 160, 255];
  switch (f.kind) {
    case "equity_investment": case "acquisition": case "joint_venture": case "compute_for_equity": return [240, 196, 80];
    case "cloud_contract": case "lease_commitment": case "purchase_commitment": case "prepayment": return [70, 206, 180];
    case "debt_financing": return [236, 140, 72];
    case "ppa": return [246, 110, 96];
    case "revenue_concentration": return [190, 200, 212];
    default: return [200, 170, 110];
  }
}

/** Labels: selection, hover, focus set, plus the biggest chokepoints (more as you zoom in). */
/** Apply a trackball rotation; latitude is clamped so the globe never flips over a pole. */
function rotate(v: Record<string, unknown>, dLon: number, dLat: number) {
  return { ...v, transitionDuration: 0,
    longitude: (((v.longitude as number) + dLon + 540) % 360) - 180,
    latitude: Math.max(-70, Math.min(75, (v.latitude as number) + dLat)) };
}

/** Great-circle angle between two lon/lat points, degrees. */
function angularDist(lon1: number, lat1: number, lon2: number, lat2: number) {
  const r = Math.PI / 180;
  const c = Math.sin(lat1 * r) * Math.sin(lat2 * r) + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon1 - lon2) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

function labelSet(facs: Facility[], idx: Index, sel: string | null, hov: string | undefined, focus: Set<string> | undefined, zoom: number) {
  const n = zoom < 1.4 ? 10 : zoom < 2.2 ? 22 : zoom < 3.2 ? 60 : 400;
  const ranked = [...facs].sort((a, b) => (idx.reach.get(b.id) ?? 0) - (idx.reach.get(a.id) ?? 0) || CHAIN.indexOf(a.layer) - CHAIN.indexOf(b.layer));
  const out = new Map<string, Facility>();
  for (const f of ranked.slice(0, n)) if (!focus || focus.has(f.id)) out.set(f.id, f);
  if (focus && focus.size < 60) for (const f of facs) if (focus.has(f.id)) out.set(f.id, f);
  for (const id of [sel, hov]) { const f = id ? idx.facility.get(id) : undefined; if (f) out.set(f.id, f); }
  return [...out.values()];
}
