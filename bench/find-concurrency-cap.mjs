// Probe + concurrency sweep for the configured swarm backends.
// Reads .env directly (keys stay in this process; never printed). Uses tiny
// thinking-off requests to keep cost to pennies. Finds the throughput knee per
// backend so you can set SWARM_BACKEND_n_CONCURRENCY sensibly.
//
//   node bench/find-concurrency-cap.mjs [path-to-.env]
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

const ENV_PATH = process.argv[2] ?? ".env";
const LEVELS = [1, 2, 4, 8, 16, 24];
const WAVES = 2; // requests per level = concurrency * WAVES
const MAX_TOKENS = 64;
const TIMEOUT_MS = 60_000;
const PROMPT = "Write a one-line TypeScript function `add(a:number,b:number)` that returns the sum. Code only.";

function parseEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function loadBackends(env) {
  const out = [];
  for (let n = 1; ; n++) {
    const p = `SWARM_BACKEND_${n}_`;
    if (!env[`${p}BASE_URL`]) break;
    out.push({
      name: env[`${p}NAME`] || `backend-${n}`,
      baseURL: env[`${p}BASE_URL`].replace(/\/$/, ""),
      apiKey: env[`${p}API_KEY`] || "",
      model: env[`${p}MODEL`] || "default",
      thinking: (env[`${p}THINKING`] || "").toLowerCase(),
    });
  }
  return out;
}

function thinkingBody(mode) {
  if (mode === "disabled" || mode === "off" || mode === "false") return { thinking: { type: "disabled" } };
  if (mode === "enabled" || mode === "on" || mode === "true") return { thinking: { type: "enabled" } };
  return {};
}

async function callOnce(backend, { withThinking = true } = {}) {
  const body = {
    model: backend.model,
    messages: [{ role: "user", content: PROMPT }],
    max_tokens: MAX_TOKENS,
    temperature: 0,
    ...(withThinking ? thinkingBody(backend.thinking) : {}),
  };
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(`${backend.baseURL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${backend.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ms = performance.now() - start;
    if (!res.ok) return { ok: false, ms, status: res.status, err: (await res.text()).slice(0, 140) };
    const j = await res.json();
    const msg = j.choices?.[0]?.message ?? {};
    return { ok: true, ms, status: 200, hasContent: Boolean(msg.content), hasReasoning: Boolean(msg.reasoning_content) };
  } catch (e) {
    return { ok: false, ms: performance.now() - start, status: 0, err: String(e).slice(0, 140) };
  } finally {
    clearTimeout(to);
  }
}

async function sweepLevel(backend, concurrency, withThinking) {
  const total = concurrency * WAVES;
  const results = [];
  let idx = 0;
  const start = performance.now();
  const worker = async () => {
    while (idx < total) {
      idx++;
      results.push(await callOnce(backend, { withThinking }));
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  const elapsed = (performance.now() - start) / 1000;
  const ok = results.filter((r) => r.ok);
  const lat = ok.map((r) => r.ms).sort((a, b) => a - b);
  const pct = (p) => (lat.length ? Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * p))]) : 0);
  return { concurrency, ok: ok.length, errors: results.length - ok.length, throughput: ok.length / elapsed, p50: pct(0.5), p95: pct(0.95) };
}

const env = parseEnv(ENV_PATH);
const backends = loadBackends(env);
if (backends.length === 0) {
  console.error("No SWARM_BACKEND_n_* groups found in", ENV_PATH);
  process.exit(1);
}

for (const b of backends) {
  console.log(`\n========== ${b.name}  (${b.model})  thinking=${b.thinking || "default"} ==========`);
  if (!b.apiKey) { console.log("  ! no API key set; skipping"); continue; }

  // Phase 0: probe with configured thinking; if it fails, retry without it.
  let useThinking = true;
  const probe = await callOnce(b, { withThinking: true });
  if (probe.ok) {
    console.log(`  probe OK  (${Math.round(probe.ms)}ms, content=${probe.hasContent}, reasoning=${probe.hasReasoning})`);
  } else {
    console.log(`  probe with thinking FAILED  status=${probe.status} ${probe.err}`);
    const probe2 = await callOnce(b, { withThinking: false });
    if (probe2.ok) {
      console.log(`  -> WITHOUT thinking param: OK. This backend doesn't accept the DeepSeek thinking field.`);
      console.log(`     ACTION: remove SWARM_BACKEND_*_THINKING for ${b.name}.`);
      useThinking = false;
    } else {
      console.log(`  -> WITHOUT thinking also FAILED  status=${probe2.status} ${probe2.err}`);
      console.log(`     skipping sweep for ${b.name} (check base URL / key / model id).`);
      continue;
    }
  }

  // Phase 1: concurrency sweep.
  console.log("  conc  ok/err  thr(req/s)  p50(ms)  p95(ms)");
  let best = 0, knee = null;
  for (const c of LEVELS) {
    const r = await sweepLevel(b, c, useThinking);
    console.log(`  ${String(c).padEnd(4)}  ${String(r.ok + "/" + r.errors).padEnd(6)} ${r.throughput.toFixed(2).padEnd(10)} ${String(r.p50).padEnd(8)} ${r.p95}`);
    if (knee === null && best > 0 && r.throughput < best * 1.1) knee = c;
    best = Math.max(best, r.throughput);
    if (r.errors > r.ok) { console.log(`  -> errors dominate at concurrency ${c}; stopping.`); knee = knee ?? Math.max(1, c / 2); break; }
  }
  console.log(`  => suggested SWARM_BACKEND_*_CONCURRENCY for ${b.name}: ~${knee ?? LEVELS[LEVELS.length - 1]}`);
}
