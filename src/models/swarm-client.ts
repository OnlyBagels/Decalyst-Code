import OpenAI from "openai";
import { WorkerError } from "../utils/errors.js";
import type {
  ModelClient,
  ModelCallArgs,
  ChatMessage,
  CompleteWithToolsArgs,
  CompleteWithToolsResult,
} from "./model-client.js";
import type { UsageTracker } from "../tui/usage-tracker.js";

export interface OpenAICompatibleClientConfig {
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  /** Pre-resolved thinking-mode body params, e.g. {thinking:{type:"disabled"}}. */
  thinkingParams?: Record<string, unknown>;
  tracker?: UsageTracker;
  /** Label used for usage tracking when the caller doesn't supply one. */
  agentLabel?: string;
}

/**
 * Creates an OpenAI-compatible chat client (DeepSeek, MiMo, OpenRouter, local
 * servers, ...). The default model and thinking params are baked in, so a pool
 * can hold one of these per backend, each with its own model and thinking mode.
 */
export function createOpenAICompatibleClient(
  cfg: OpenAICompatibleClientConfig,
): ModelClient {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  const thinking = cfg.thinkingParams ?? {};

  async function complete(
    messages: ChatMessage[],
    temperature: number,
    maxTokens: number,
    model: string,
    jsonMode: boolean,
    agent: string | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...thinking,
    };
    if (jsonMode) body["response_format"] = { type: "json_object" };

    const res = await client.chat.completions.create(
      body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { signal },
    );

    if (cfg.tracker && res.usage) {
      const usage = res.usage as {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
      };
      cfg.tracker.record({
        agent: agent ?? cfg.agentLabel ?? "swarm",
        model,
        promptTokens: usage.prompt_tokens ?? 0,
        completionTokens: usage.completion_tokens ?? 0,
        cacheHitTokens: usage.prompt_cache_hit_tokens ?? 0,
      });
    }

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new WorkerError("Swarm worker returned empty response");
    }
    return content;
  }

  return {
    async completeJson({
      model,
      messages,
      temperature,
      maxTokens,
      agent,
      signal,
    }: ModelCallArgs) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? cfg.defaultModel,
        true,
        agent,
        signal,
      );
    },
    async completeText({
      model,
      messages,
      temperature,
      maxTokens,
      agent,
      signal,
    }: ModelCallArgs) {
      return complete(
        messages,
        temperature,
        maxTokens,
        model ?? cfg.defaultModel,
        false,
        agent,
        signal,
      );
    },
    async completeWithTools(
      _args: CompleteWithToolsArgs,
    ): Promise<CompleteWithToolsResult> {
      throw new WorkerError("swarm-client does not support tools API");
    },
  };
}

/** Legacy single-backend swarm client driven by the SWARM_* environment vars. */
export function createSwarmClient(tracker?: UsageTracker): ModelClient {
  const baseURL =
    process.env["SWARM_BASE_URL"] ??
    process.env["DECALYST_BASE_URL"] ??
    "http://localhost:1234/v1";
  const apiKey =
    process.env["SWARM_API_KEY"] ?? process.env["DECALYST_API_KEY"] ?? "EMPTY";
  const defaultModel =
    process.env["SWARM_MODEL"] ?? process.env["DECALYST_MODEL"] ?? "default";

  return createOpenAICompatibleClient({
    baseURL,
    apiKey,
    defaultModel,
    thinkingParams: resolveThinkingParams(),
    ...(tracker ? { tracker } : {}),
  });
}

export function getDefaultSwarmModel(): string {
  return (
    process.env["SWARM_MODEL"] ?? process.env["DECALYST_MODEL"] ?? "default"
  );
}

/**
 * Resolves the thinking-mode body params from a thinking mode string and an
 * optional effort. Opt-in: with mode unset, nothing is sent and the provider
 * default applies (so non-DeepSeek backends never see an unknown field). Pass
 * `disabled` to run workers without chain-of-thought — the right default for a
 * swarm, since the orchestrator already did the reasoning and workers only
 * execute a planned edit. Effort (high|max|low|medium|xhigh) applies only when
 * thinking is enabled.
 */
export function resolveThinkingParams(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  return thinkingParamsFor(env["SWARM_THINKING"], env["SWARM_REASONING_EFFORT"]);
}

/** Builds thinking-mode body params from an explicit mode + effort string. */
export function thinkingParamsFor(
  mode: string | undefined,
  effort: string | undefined,
): Record<string, unknown> {
  if (mode === undefined || mode === "") return {};

  const m = mode.toLowerCase();
  const off =
    m === "disabled" ||
    m === "off" ||
    m === "false" ||
    m === "0" ||
    m === "no";

  const params: Record<string, unknown> = {
    thinking: { type: off ? "disabled" : "enabled" },
  };
  if (!off && effort) params["reasoning_effort"] = effort;
  return params;
}
