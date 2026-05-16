import { computeCost, getPricing } from "./pricing.js";

export interface AgentUsage {
  agent: string;
  model: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  lastPromptTokens: number; // for "ctx used on last call"
  cost: number;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  cost: number;
  calls: number;
}

export type UsageListener = () => void;

export class UsageTracker {
  private readonly agents = new Map<string, AgentUsage>();
  private readonly listeners = new Set<UsageListener>();
  private phaseName: string = "init";
  private startedAt: number = Date.now();

  onChange(listener: UsageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  setPhase(name: string): void {
    this.phaseName = name;
    this.emit();
  }

  phase(): string {
    return this.phaseName;
  }

  elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  record(args: {
    agent: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
  }): void {
    const existing = this.agents.get(args.agent);
    const cost = computeCost(
      args.model,
      args.promptTokens,
      args.completionTokens,
    );

    if (existing) {
      existing.calls += 1;
      existing.promptTokens += args.promptTokens;
      existing.completionTokens += args.completionTokens;
      existing.lastPromptTokens = args.promptTokens;
      existing.cost += cost;
      // Update model in case a later call uses a different one
      existing.model = args.model;
    } else {
      this.agents.set(args.agent, {
        agent: args.agent,
        model: args.model,
        calls: 1,
        promptTokens: args.promptTokens,
        completionTokens: args.completionTokens,
        lastPromptTokens: args.promptTokens,
        cost,
      });
    }
    this.emit();
  }

  allAgents(): AgentUsage[] {
    return [...this.agents.values()];
  }

  totals(): UsageTotals {
    let promptTokens = 0;
    let completionTokens = 0;
    let cost = 0;
    let calls = 0;
    for (const a of this.agents.values()) {
      promptTokens += a.promptTokens;
      completionTokens += a.completionTokens;
      cost += a.cost;
      calls += a.calls;
    }
    return { promptTokens, completionTokens, cost, calls };
  }

  /** Context utilization on the agent's most recent call, as fraction 0..1. */
  contextUtilization(agent: AgentUsage): number {
    const ctx = getPricing(agent.model).contextWindow;
    if (ctx <= 0) return 0;
    return Math.min(1, agent.lastPromptTokens / ctx);
  }
}
