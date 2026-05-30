import type { EventBus } from "../events/bus.js";
import type { Mode, ModeBudgets, ModeState } from "./types.js";
import { ModeError, BudgetExceededError } from "./errors.js";

const LEGAL_TRANSITIONS: Record<Mode, Mode[]> = {
  idle: ["plan", "failed"],
  plan: ["execute", "failed"],
  execute: ["review", "failed"],
  review: ["plan", "done", "failed"],
  done: [],
  failed: [],
};

export class ModeController {
  private state: ModeState;

  constructor(
    private bus: EventBus,
    private budgets: ModeBudgets,
  ) {
    this.state = {
      current: "idle",
      fixRound: 0,
      startedAt: Date.now(),
      toolCallsThisTurn: 0,
      webFetchesThisRun: 0,
    };
  }

  get current(): Mode {
    return this.state.current;
  }

  get state$(): Readonly<ModeState> {
    return Object.freeze({ ...this.state });
  }

  async transition(to: Mode): Promise<void> {
    const { current } = this.state;

    if (!LEGAL_TRANSITIONS[current].includes(to)) {
      throw new ModeError(
        `Cannot transition from '${current}' to '${to}'`,
        current,
        to,
      );
    }

    // Increment fixer round when review -> plan
    if (current === "review" && to === "plan") {
      this.state.fixRound++;
    }

    this.state.current = to;

    // Reset turn counters on mode entry
    if (to !== "plan" && to !== "execute" && to !== "review") {
      this.state.toolCallsThisTurn = 0;
    }

    this.bus.emit({ t: "mode_change", mode: to });
  }

  canCallTool(toolModes: Mode[]): boolean {
    return toolModes.includes(this.state.current);
  }

  isFixerRoundsExhausted(): boolean {
    return this.state.fixRound >= this.budgets.maxFixRounds;
  }

  incrementFixerRound(): void {
    this.state.fixRound++;
  }

  resetTurnCounters(): void {
    this.state.toolCallsThisTurn = 0;
  }

  recordToolCall(toolName: string): void {
    this.state.toolCallsThisTurn++;

    if (this.state.toolCallsThisTurn > this.budgets.maxToolCallsPerTurn) {
      throw new BudgetExceededError(
        `Tool call budget exceeded: ${this.state.toolCallsThisTurn} > ${this.budgets.maxToolCallsPerTurn} per turn`,
        "maxToolCallsPerTurn",
      );
    }
  }

  recordWebFetch(): void {
    this.state.webFetchesThisRun++;

    if (this.state.webFetchesThisRun > this.budgets.maxWebFetchesPerRun) {
      throw new BudgetExceededError(
        `Web fetch budget exceeded: ${this.state.webFetchesThisRun} > ${this.budgets.maxWebFetchesPerRun} per run`,
        "maxWebFetchesPerRun",
      );
    }
  }

  isWallClockExpired(): boolean {
    const elapsed = Date.now() - this.state.startedAt;
    return elapsed > this.budgets.wallClockMs;
  }
}
