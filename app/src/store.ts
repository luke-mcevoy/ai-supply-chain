import { create } from "zustand";
import { CHAIN, type Layer } from "./atlas";

export type Mode = "network" | "capital" | "controls";

export interface Hover { id: string; kind: string; x: number; y: number }

interface State {
  mode: Mode;
  layers: Set<Layer>;
  showInferred: boolean;
  showFlagged: boolean;
  showPlanned: boolean;
  selected: string | null;
  hover: Hover | null;
  trace: boolean;
  severed: Set<string>; // node ids, or "country:XX"
  controlDate: number;
  /** Controls view: whose restrictions to draw. */
  ctlBloc: "allies" | "cn" | "all";
  paletteOpen: boolean;
  aboutOpen: boolean;
  dataOpen: boolean;
  railOpen: boolean;
  flyTo: { lon: number; lat: number; zoom?: number; t: number } | null;
  /** Active chain walk: anchor node, direction, current step index. */
  tour: { anchor: string; dir: "up" | "down"; step: number } | null;
  story: { id: string; step: number } | null;
  storyPicker: boolean;

  setMode: (m: Mode) => void;
  toggleLayer: (l: Layer) => void;
  soloLayer: (l: Layer) => void;
  set: (p: Partial<State>) => void;
  select: (id: string | null) => void;
  /** Previously selected items, most recent last (inspector Back button). */
  trail: string[];
  back: () => void;
  toggleSever: (id: string) => void;
  focus: (lon: number, lat: number, zoom?: number) => void;
}

const readHash = () => new URLSearchParams(location.hash.slice(1));

export const useStore = create<State>((set, get) => ({
  mode: (readHash().get("mode") as Mode) || "network",
  layers: new Set(CHAIN),
  showInferred: true,
  showFlagged: true,
  showPlanned: true,
  selected: readHash().get("sel"),
  trail: [],
  hover: null,
  trace: readHash().get("trace") === "1",
  severed: new Set(readHash().get("sever")?.split(",").filter(Boolean) ?? []),
  controlDate: Date.now(),
  ctlBloc: "allies",
  paletteOpen: false,
  aboutOpen: false,
  dataOpen: false,
  railOpen: typeof window !== "undefined" ? window.innerWidth > 900 : true,
  flyTo: null,
  tour: null,
  story: null,
  storyPicker: false,

  setMode: (mode) => set({ mode }),
  toggleLayer: (l) => {
    const layers = new Set(get().layers);
    if (layers.has(l)) layers.delete(l); else layers.add(l);
    set({ layers });
  },
  soloLayer: (l) => {
    const cur = get().layers;
    set({ layers: cur.size === 1 && cur.has(l) ? new Set(CHAIN) : new Set([l]) });
  },
  set: (p) => set(p),
  select: (selected) => {
    const cur = get().selected;
    const trail = !selected ? [] : cur && cur !== selected ? [...get().trail, cur].slice(-50) : get().trail;
    set({ selected, trace: selected ? get().trace : false , trail });
  },
  back: () => {
    const trail = [...get().trail];
    const prev = trail.pop();
    if (prev) set({ selected: prev, trail });
  },
  toggleSever: (id) => {
    const severed = new Set(get().severed);
    if (severed.has(id)) severed.delete(id); else severed.add(id);
    set({ severed });
  },
  focus: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, t: Date.now() } }),
}));

// Shareable URLs: mode, selection, trace and severed set live in the hash.
let lastSel: string | null = useStore.getState().selected;
let fromPopstate = false;
// Browser Back/Forward restores the selection recorded in the URL.
if (typeof window !== "undefined") window.addEventListener("popstate", () => {
  const sel = new URLSearchParams(location.hash.slice(1)).get("sel");
  const st = useStore.getState();
  fromPopstate = true;
  const trail = st.trail.at(-1) === sel ? st.trail.slice(0, -1) : st.trail;
  useStore.setState({ selected: sel, trail });
  lastSel = sel;
  fromPopstate = false;
});
useStore.subscribe((s) => {
  const p = new URLSearchParams();
  if (s.mode !== "network") p.set("mode", s.mode);
  if (s.selected) p.set("sel", s.selected);
  if (s.trace) p.set("trace", "1");
  if (s.severed.size) p.set("sever", [...s.severed].join(","));
  const h = p.toString();
  if (h === location.hash.slice(1)) return;
  const url = h ? `#${h}` : location.pathname;
  if (s.selected !== lastSel && !fromPopstate) history.pushState(null, "", url); else history.replaceState(null, "", url);
  lastSel = s.selected;
});
