import { thinkingParamsFor } from "./swarm-client.js";

export interface BackendConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  concurrency: number;
  thinkingParams: Record<string, unknown>;
  /** Routing tier: "bulk" (default) or "pro". swarm-exec selects one tier per run. */
  tier: string;
}

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIER = "bulk";

/**
 * Loads the swarm worker backends from the environment. Define one or more
 * numbered groups so the swarm runs across several providers at once — their
 * concurrency stacks, so the effective width is the sum of the per-backend caps:
 *
 *   SWARM_BACKEND_1_NAME=deepseek
 *   SWARM_BACKEND_1_BASE_URL=https://api.deepseek.com
 *   SWARM_BACKEND_1_API_KEY=...
 *   SWARM_BACKEND_1_MODEL=deepseek-v4-flash
 *   SWARM_BACKEND_1_CONCURRENCY=8
 *   SWARM_BACKEND_1_THINKING=disabled
 *
 * Falls back to the single legacy SWARM_* backend when no numbered groups exist.
 * Returns an empty array when nothing is configured (the caller decides how to
 * surface that).
 */
export function loadBackends(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig[] {
  const backends: BackendConfig[] = [];

  // Scan a fixed range so gaps are allowed: comment a backend out (or set
  // SWARM_BACKEND_n_ENABLED=false) and the rest still load.
  const MAX_BACKENDS = 24;
  for (let n = 1; n <= MAX_BACKENDS; n++) {
    const prefix = `SWARM_BACKEND_${n}_`;
    const baseURL = env[`${prefix}BASE_URL`];
    if (!baseURL) continue;
    if (isDisabled(env[`${prefix}ENABLED`])) continue;

    backends.push({
      name: env[`${prefix}NAME`] ?? `backend-${n}`,
      baseURL,
      apiKey: env[`${prefix}API_KEY`] ?? "EMPTY",
      model: env[`${prefix}MODEL`] ?? "default",
      concurrency: parseConcurrency(env[`${prefix}CONCURRENCY`]),
      thinkingParams: thinkingParamsFor(
        env[`${prefix}THINKING`],
        env[`${prefix}REASONING_EFFORT`],
      ),
      tier: (env[`${prefix}TIER`] ?? DEFAULT_TIER).toLowerCase(),
    });
  }

  if (backends.length > 0) return backends;

  // Legacy single-backend fallback.
  const baseURL = env["SWARM_BASE_URL"] ?? env["DECALYST_BASE_URL"];
  if (!baseURL || isDisabled(env["SWARM_ENABLED"])) return [];

  return [
    {
      name: "swarm",
      baseURL,
      apiKey: env["SWARM_API_KEY"] ?? env["DECALYST_API_KEY"] ?? "EMPTY",
      model: env["SWARM_MODEL"] ?? env["DECALYST_MODEL"] ?? "default",
      concurrency: parseConcurrency(
        env["DECALYST_CONCURRENCY"] ?? env["SWARM_CONCURRENCY"],
      ),
      thinkingParams: thinkingParamsFor(
        env["SWARM_THINKING"],
        env["SWARM_REASONING_EFFORT"],
      ),
      tier: DEFAULT_TIER,
    },
  ];
}

/** Backends in a tier (default "bulk"). Empty if none configured for it. */
export function backendsForTier(
  tier: string,
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig[] {
  const want = tier.toLowerCase();
  return loadBackends(env).filter((b) => b.tier === want);
}

/** A backend is off when its ENABLED value is explicitly falsey. */
function isDisabled(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const v = raw.trim().toLowerCase();
  return v === "false" || v === "0" || v === "no" || v === "off" || v === "disabled";
}

function parseConcurrency(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONCURRENCY;
}
