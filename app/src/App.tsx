import { useEffect, useState } from "react";
import { buildIndex, type Atlas, type Index } from "./atlas";
import { loadWorld, type World } from "./geo";
import Globe from "./Globe";
import Inspector from "./ui/Inspector";
import { TopBar, Rail, Tooltip, Bottom, Palette, About } from "./ui/Chrome";
import TourPanel from "./ui/Tour";
import DataTable from "./ui/DataTable";
import StoryPanel, { StoryPicker } from "./ui/Story";

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null);
  const [world, setWorld] = useState<World | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const small = window.innerWidth < 700;
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}atlas.json`).then((r) => { if (!r.ok) throw new Error(`atlas.json: HTTP ${r.status}`); return r.json() as Promise<Atlas>; }),
      loadWorld(small ? "110m" : "50m"),
    ]).then(([atlas, w]) => { setIdx(buildIndex(atlas)); setWorld(w); })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="boot"><div>Could not load the atlas.</div><div className="mono small muted">{error}</div><div className="small muted">Run <code>npm run build:data</code> from the repo root.</div></div>;
  if (!idx || !world) return <div className="boot"><div className="spinner" /><div className="mono small muted">LOADING ATLAS</div></div>;

  return (
    <div className="app">
      <Globe idx={idx} world={world} />
      <TopBar idx={idx} />
      <Rail idx={idx} />
      <Inspector idx={idx} />
      <Bottom idx={idx} />
      <TourPanel idx={idx} />
      <StoryPanel idx={idx} />
      <StoryPicker />
      <Tooltip idx={idx} />
      <Palette idx={idx} />
      <About idx={idx} />
      <DataTable idx={idx} />
    </div>
  );
}
