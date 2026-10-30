#!/usr/bin/env node
// Build a static Roast Room for GitHub Pages: the same room, replaying saved councils from JSON.
//
//   node app/scripts/export-static.mjs [out dir, default site/]
//
// Publishes only the shipped examples (sessions/*example*) and the councils kept on purpose in
// councils/. Your own sessions/ stay private. A static room cannot run a council: councils run
// in Claude Code with /roast-room, locally, and land here once copied into councils/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(APP, "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "site"));

// Curate the councils to publish into one folder and point the app's loaders at it.
const pick = fs.mkdtempSync(path.join(os.tmpdir(), "roast-export-"));
const from = [
  ...fs.readdirSync(path.join(ROOT, "sessions")).filter((d) => d.includes("example")).map((d) => path.join(ROOT, "sessions", d)),
  ...(fs.existsSync(path.join(ROOT, "councils")) ? fs.readdirSync(path.join(ROOT, "councils")).map((d) => path.join(ROOT, "councils", d)) : []),
].filter((d) => fs.statSync(d).isDirectory());
for (const d of from) fs.cpSync(d, path.join(pick, path.basename(d)), { recursive: true });
process.env.ROAST_SESSIONS_DIR = pick;

const { loadRoster, BOARD } = await import("../lib/seats.mjs");
const { listSaved, loadSaved, MODELS } = await import("../lib/council.mjs");
const watch = await import("../lib/watch.mjs");

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(APP, "public"), OUT, { recursive: true });
const html = path.join(OUT, "index.html");
fs.writeFileSync(html, fs.readFileSync(html, "utf8").replace("<html", '<html data-static="1"'));
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

const write = (rel, data) => {
  const f = path.join(OUT, "api", rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data));
};
const pub = path.join(APP, "public");
const frame = (key, sh) => ["webp", "png", "jpg"].map((x) => `${key}-${sh}.${x}`).find((f) => fs.existsSync(path.join(pub, "portraits", f)));
const seats = loadRoster().map((s) => ({ ...s, portraits: Object.fromEntries(["base", "open", "mid", "blink"].map((sh) => [sh, frame(s.key, sh)]).filter(([, f]) => f).map(([sh, f]) => [sh, `portraits/${f}`])) }));
write("seats.json", { seats, board: BOARD, models: MODELS, runner: "viewer", hasKey: false });

watch.scan();
const sessions = [...listSaved(), ...watch.listLive()].sort((a, b) => (a.id < b.id ? 1 : -1)).map(({ file, ...s }) => s);
for (const s of sessions) {
  const x = watch.getLive(s.id);
  const j = loadSaved(s.id) || (x && { id: s.id, title: x.title, mode: x.mode, status: x.status, events: x.events });
  if (!j) throw new Error(`could not load ${s.id}`);
  write(`sessions/${encodeURIComponent(s.id)}.json`, j);
}
write("sessions.json", { sessions, running: null, live: null });
fs.rmSync(pick, { recursive: true, force: true });
console.log(`static room: ${seats.length} seats, ${sessions.length} councils -> ${path.relative(ROOT, OUT) || OUT}`);
process.exit(0);
