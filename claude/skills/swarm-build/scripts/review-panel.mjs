#!/usr/bin/env node
// 3-model final-review panel. Sends a diff to the PRO backends (DeepSeek V4 Pro +
// MiMo V2.5-Pro) from the decalyst repo's .env and prints each model's findings.
// Opus (you) is the third reviewer: read both, add your own pass, reconcile. A
// finding >=2 of 3 agree on is real; you make the final call.
//
// Spends API credits — run only when reviewing real work.
//   git diff | node review-panel.mjs
//   node review-panel.mjs --input changes.diff
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

const args = parse(process.argv.slice(2));
const decalyst = resolveDecalyst();
const env = parseEnv(path.join(decalyst, ".env"));

function resolveDecalyst() {
  if (process.env["DECALYST_DIR"]) return process.env["DECALYST_DIR"];
  if (existsSync(path.join(process.cwd(), "src/cli/index.ts"))) return process.cwd();
  return "C:/Users/Administrator/Desktop/decalyst-swarm";
}
const pros = loadBackends(env).filter((b) => b.tier === "pro" && b.apiKey);

if (pros.length === 0) {
  console.error(
    "no pro-tier backends with keys in .env (need SWARM_BACKEND_n_TIER=pro). Set DECALYST_DIR if the repo is elsewhere.",
  );
  process.exit(1);
}

const SYS =
  "You are a senior code reviewer. Review the diff for correctness bugs, security " +
  "issues, and convention violations. For each finding give: file, what is wrong, " +
  "severity (high/med/low). Report only real findings; if there are none, say 'no " +
  "issues found'. Be terse, no preamble.";

(async () => {
  const diff = args.input
    ? readFileSync(path.resolve(args.input), "utf8")
    : await readStdin();
  if (!diff.trim()) {
    console.error("no diff provided (pipe `git diff` or pass --input <file>)");
    process.exit(2);
  }

  const results = await Promise.all(
    pros.map(async (b) => {
      try {
        return { b, text: await review(b, diff) };
      } catch (e) {
        return { b, text: `(review failed: ${String(e).slice(0, 200)})` };
      }
    }),
  );

  for (const { b, text } of results) {
    console.log(`\n===== ${b.name} (${b.model}) =====`);
    console.log(text.trim());
  }
  console.log("\n===== panel =====");
  console.log(
    "Opus: read both reviews, add your own pass, reconcile. A finding 2+ of 3 agree on is real; you make the final call.",
  );
})();

async function review(backend, diff) {
  const body = {
    model: backend.model,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: "Review this diff:\n\n" + truncate(diff, 60000) },
    ],
    max_tokens: 3000,
    ...backend.thinking,
  };
  const res = await fetch(`${backend.baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${backend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || "(empty response)";
}

function loadBackends(env) {
  const out = [];
  for (let n = 1; ; n++) {
    const p = `SWARM_BACKEND_${n}_`;
    if (!env[`${p}BASE_URL`]) break;
    const mode = (env[`${p}THINKING`] || "").toLowerCase();
    let thinking = {};
    if (["enabled", "on", "true"].includes(mode)) {
      thinking = { thinking: { type: "enabled" } };
      if (env[`${p}REASONING_EFFORT`]) thinking.reasoning_effort = env[`${p}REASONING_EFFORT`];
    } else if (["disabled", "off", "false"].includes(mode)) {
      thinking = { thinking: { type: "disabled" } };
    }
    out.push({
      name: env[`${p}NAME`] || `backend-${n}`,
      baseURL: env[`${p}BASE_URL`],
      apiKey: env[`${p}API_KEY`] || "",
      model: env[`${p}MODEL`] || "default",
      tier: (env[`${p}TIER`] || "bulk").toLowerCase(),
      thinking,
    });
  }
  return out;
}

function parseEnv(p) {
  const e = {};
  try {
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env */
  }
  return e;
}

function readStdin() {
  return new Promise((r) => {
    let d = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (d += c));
    process.stdin.on("end", () => r(d));
  });
}

function truncate(s, n) {
  return s.length <= n ? s : s.slice(0, n) + "\n...[truncated]";
}

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) o[a.slice(2)] = argv[++i];
  }
  return o;
}
