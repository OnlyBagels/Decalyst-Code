#!/usr/bin/env node
// Thin wrapper around decalyst `swarm-exec`. Runs from the decalyst repo (so its
// .env / backends load), pointed at any target workspace. Planning and review are
// the orchestrator's job (see SKILL.md); this only drives the engine.
//
//   node run-swarm.mjs --plan plan.json --workspace <target-dir> [--out result.json] [--verify]
//   env: DECALYST_DIR = path to the decalyst-swarm repo
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const args = parse(process.argv.slice(2));
const decalyst = resolveDecalyst();

function resolveDecalyst() {
  if (process.env["DECALYST_DIR"]) return process.env["DECALYST_DIR"];
  if (fs.existsSync(path.join(process.cwd(), "src/cli/index.ts"))) return process.cwd();
  return "C:/Users/Administrator/Desktop/decalyst-swarm";
}

if (!args.plan || !args.workspace) {
  console.error(
    "usage: run-swarm.mjs --plan <plan.json> --workspace <dir> [--tier bulk|pro] [--out <result.json>] [--verify]",
  );
  console.error(`env DECALYST_DIR (decalyst-swarm repo) default: ${decalyst}`);
  process.exit(2);
}
if (!fs.existsSync(decalyst)) {
  console.error(`decalyst repo not found at ${decalyst}. Set DECALYST_DIR.`);
  process.exit(1);
}

const cli = [
  "tsx",
  "src/cli/index.ts",
  "swarm-exec",
  "--plan",
  path.resolve(args.plan),
  "--workspace",
  path.resolve(args.workspace),
  "--tier",
  args.tier || "bulk",
  "--json",
];
if (args.out) cli.push("--out", path.resolve(args.out));
if (args.verify) cli.push("--verify");

const res = spawnSync("npx", cli, { cwd: decalyst, stdio: "inherit", shell: true });
process.exit(res.status ?? 1);

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--verify") o.verify = true;
    else if (a.startsWith("--")) o[a.slice(2)] = argv[++i];
  }
  return o;
}
