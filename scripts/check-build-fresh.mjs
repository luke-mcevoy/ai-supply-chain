#!/usr/bin/env node
// CI guard: the committed app/public/atlas.json must equal a fresh verified build of the data
// (ignoring built_at), and must never be a --draft build.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const committed = readFileSync("app/public/atlas.json", "utf8");
execFileSync("node", ["scripts/build.mjs"], { stdio: "ignore" });
const fresh = readFileSync("app/public/atlas.json", "utf8");
const strip = (s) => { const j = JSON.parse(s); delete j.built_at; return JSON.stringify(j); };
if (JSON.parse(committed).draft) { console.error("app/public/atlas.json is a DRAFT build; never commit one."); process.exit(1); }
if (strip(committed) !== strip(fresh)) {
  console.error("app/public/atlas.json is stale: run `node scripts/build.mjs` and commit the result.");
  process.exit(1);
}
console.log("atlas.json matches a fresh verified build");
