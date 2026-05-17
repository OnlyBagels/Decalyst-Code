import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import { handleCommand } from "../../../src/agent/actions/command-action.js";
import { createSessionState } from "../../../src/agent/session-state.js";
import { FileManager } from "../../../src/files/file-manager.js";

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeTmp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "decalyst-cmd-"));
  tmpDirs.push(dir);
  return dir;
}

describe("handleCommand", () => {
  it("/help returns a message listing commands", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/help", state, { fileManager: fm });
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.kind).toBe("system");
    expect(result.messages[0]?.text).toContain("/exit");
    expect(result.exit).toBeUndefined();
  });

  it("/exit sets exit: true", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/exit", state, { fileManager: fm });
    expect(result.exit).toBe(true);
  });

  it("/quit sets exit: true", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/quit", state, { fileManager: fm });
    expect(result.exit).toBe(true);
  });

  it("/workspace with no arg prints current workspace", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/workspace", state, { fileManager: fm });
    expect(result.messages[0]?.text).toContain(tmp);
    expect(result.mutations.workspaceRoot).toBeUndefined();
  });

  it("/workspace <path> sets workspaceRoot in mutations", async () => {
    const tmp = await makeTmp();
    const newWs = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand(`/workspace ${newWs}`, state, { fileManager: fm });
    expect(result.mutations.workspaceRoot).toBe(newWs);
    expect(result.messages[0]?.text).toContain(newWs);
  });

  it("/clear returns empty transcript in mutations", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/clear", state, { fileManager: fm });
    expect(result.mutations.transcript).toEqual([]);
  });

  it("/model with no args prints current models", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    state.orchestratorModel = "my-model";
    const fm = new FileManager(tmp);
    const result = await handleCommand("/model", state, { fileManager: fm });
    expect(result.messages[0]?.text).toContain("my-model");
  });

  it("/model orchestrator <name> sets orchestratorModel", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/model orchestrator gpt-4o", state, { fileManager: fm });
    expect(result.mutations.orchestratorModel).toBe("gpt-4o");
  });

  it("/model swarm <name> sets swarmModel", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/model swarm local-llama", state, { fileManager: fm });
    expect(result.mutations.swarmModel).toBe("local-llama");
  });

  it("/cancel with no active run returns 'No active run'", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/cancel", state, { fileManager: fm });
    expect(result.messages[0]?.text).toMatch(/no active run/i);
  });

  it("/cancel with active run calls abort()", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const ac = new AbortController();
    let aborted = false;
    ac.signal.addEventListener("abort", () => { aborted = true; });
    state.activeRun = { startedAt: Date.now(), abortController: ac };
    const fm = new FileManager(tmp);
    const result = await handleCommand("/cancel", state, { fileManager: fm });
    expect(aborted).toBe(true);
    expect(result.messages[0]?.text).toMatch(/aborted/i);
  });

  it("/permissions with empty map reports none", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/permissions", state, { fileManager: fm });
    expect(result.messages[0]?.text).toMatch(/no permission/i);
  });

  it("unknown command returns an error message", async () => {
    const tmp = await makeTmp();
    const state = createSessionState({ workspaceRoot: tmp });
    const fm = new FileManager(tmp);
    const result = await handleCommand("/notacommand", state, { fileManager: fm });
    expect(result.messages[0]?.text).toContain("Unknown command");
    expect(result.exit).toBeUndefined();
  });
});
