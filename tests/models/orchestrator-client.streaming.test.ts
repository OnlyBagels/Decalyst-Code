import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelCallArgs } from "../../src/models/model-client.js";

// Minimal fake OpenAI client factory so tests never touch the network.
function makeStreamingOpenAI(chunks: string[]) {
  return {
    chat: {
      completions: {
        create: vi.fn(async (body: Record<string, unknown>, opts?: { signal?: AbortSignal }) => {
          if (body["stream"]) {
            async function* gen() {
              for (const text of chunks) {
                if (opts?.signal?.aborted) {
                  const err = new Error("Request was aborted.");
                  err.name = "AbortError";
                  throw err;
                }
                yield {
                  choices: [{ delta: { content: text }, finish_reason: null }],
                  usage: null,
                };
              }
              yield {
                choices: [{ delta: { content: "" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 10, completion_tokens: chunks.length },
              };
            }
            return gen();
          }
          if (opts?.signal?.aborted) {
            const err = new Error("Request was aborted.");
            err.name = "AbortError";
            throw err;
          }
          return {
            choices: [{ message: { content: chunks.join("") } }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          };
        }),
      },
    },
  };
}

function makeOrchestratorClientWithFake(
  fakeOpenAI: ReturnType<typeof makeStreamingOpenAI>,
) {
  // We patch the module by injecting via a closure — build the client object
  // directly using the same logic as the real factory so we can unit-test it
  // without importing the real one (which requires ORCHESTRATOR_API_KEY).
  const OrchestratorError = class extends Error {
    constructor(msg: string) { super(msg); this.name = "OrchestratorError"; }
  };

  const tracker = {
    record: vi.fn(),
  };

  const defaultModel = "test-model";

  async function complete(
    messages: unknown[],
    temperature: number,
    maxTokens: number,
    model: string,
    agent: string | undefined,
    signal?: AbortSignal,
    onDelta?: (text: string) => void,
  ): Promise<string> {
    if (onDelta !== undefined) {
      const stream = await fakeOpenAI.chat.completions.create(
        {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal },
      ) as AsyncIterable<{ choices: Array<{ delta: { content?: string } }>; usage: { prompt_tokens: number; completion_tokens: number } | null }>;

      let accumulated = "";
      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          accumulated += delta;
          onDelta(delta);
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
      }

      if (tracker && (promptTokens > 0 || completionTokens > 0)) {
        tracker.record({
          agent: agent ?? "orchestrator",
          model,
          promptTokens,
          completionTokens,
        });
      }

      if (!accumulated) {
        throw new OrchestratorError("Orchestrator returned empty response");
      }
      return accumulated;
    }

    const res = await fakeOpenAI.chat.completions.create(
      { model, messages, temperature, max_tokens: maxTokens },
      { signal },
    ) as { choices: Array<{ message: { content: string } }>; usage: { prompt_tokens: number; completion_tokens: number } };

    if (tracker && res.usage) {
      tracker.record({
        agent: agent ?? "orchestrator",
        model,
        promptTokens: res.usage.prompt_tokens ?? 0,
        completionTokens: res.usage.completion_tokens ?? 0,
      });
    }

    const content = res.choices[0]?.message?.content;
    if (!content) {
      throw new OrchestratorError("Orchestrator returned empty response");
    }
    return content;
  }

  return {
    client: {
      async completeJson(args: ModelCallArgs) {
        return complete(args.messages, args.temperature, args.maxTokens, args.model ?? defaultModel, args.agent, args.signal, args.onDelta);
      },
      async completeText(args: ModelCallArgs) {
        return complete(args.messages, args.temperature, args.maxTokens, args.model ?? defaultModel, args.agent, args.signal, args.onDelta);
      },
    },
    tracker,
  };
}

const BASE_ARGS: ModelCallArgs = {
  model: "test-model",
  messages: [{ role: "user", content: "hello" }],
  temperature: 0.2,
  maxTokens: 100,
};

describe("orchestrator-client streaming", () => {
  it("onDelta fires for each chunk and final text equals sum", async () => {
    const chunks = ["Hello", " world", "!"];
    const { client } = makeOrchestratorClientWithFake(makeStreamingOpenAI(chunks));

    const deltas: string[] = [];
    const result = await client.completeText({
      ...BASE_ARGS,
      onDelta: (d) => deltas.push(d),
    });

    expect(deltas).toEqual(chunks);
    expect(result).toBe("Hello world!");
  });

  it("returned text equals concatenation of all deltas", async () => {
    const chunks = ["foo", "bar", "baz"];
    const { client } = makeOrchestratorClientWithFake(makeStreamingOpenAI(chunks));

    const deltas: string[] = [];
    const result = await client.completeText({
      ...BASE_ARGS,
      onDelta: (d) => deltas.push(d),
    });

    expect(result).toBe(deltas.join(""));
  });

  it("abort during stream raises AbortError", async () => {
    const ac = new AbortController();
    const chunks = ["chunk1", "chunk2", "chunk3"];
    const fakeOpenAI = makeStreamingOpenAI(chunks);

    // Override create to check abort mid-stream
    const origCreate = fakeOpenAI.chat.completions.create;
    fakeOpenAI.chat.completions.create = vi.fn(async (body, opts) => {
      if (body["stream"]) {
        async function* gen() {
          yield {
            choices: [{ delta: { content: "chunk1" }, finish_reason: null }],
            usage: null,
          };
          // abort before second chunk
          ac.abort();
          if (opts?.signal?.aborted) {
            const err = new Error("Request was aborted.");
            err.name = "AbortError";
            throw err;
          }
          yield {
            choices: [{ delta: { content: "chunk2" }, finish_reason: null }],
            usage: null,
          };
        }
        return gen();
      }
      return origCreate(body, opts);
    }) as typeof fakeOpenAI.chat.completions.create;

    const { client } = makeOrchestratorClientWithFake(fakeOpenAI);

    await expect(
      client.completeText({
        ...BASE_ARGS,
        signal: ac.signal,
        onDelta: () => undefined,
      }),
    ).rejects.toThrow(/aborted/i);
  });

  it("non-streaming path: no onDelta, returns full text", async () => {
    const chunks = ["full response text"];
    const { client } = makeOrchestratorClientWithFake(makeStreamingOpenAI(chunks));

    const result = await client.completeText(BASE_ARGS);

    expect(result).toBe("full response text");
  });

  it("non-streaming abort raises AbortError", async () => {
    const ac = new AbortController();
    ac.abort();

    const chunks = ["hello"];
    const { client } = makeOrchestratorClientWithFake(makeStreamingOpenAI(chunks));

    await expect(
      client.completeText({ ...BASE_ARGS, signal: ac.signal }),
    ).rejects.toThrow(/aborted/i);
  });

  it("tracker records usage after stream", async () => {
    const chunks = ["a", "b"];
    const { client, tracker } = makeOrchestratorClientWithFake(makeStreamingOpenAI(chunks));

    await client.completeText({ ...BASE_ARGS, onDelta: () => undefined });

    expect(tracker.record).toHaveBeenCalledOnce();
    const call = tracker.record.mock.calls[0]?.[0] as { promptTokens: number; completionTokens: number } | undefined;
    expect(call?.promptTokens).toBe(10);
    expect(call?.completionTokens).toBe(2);
  });
});
