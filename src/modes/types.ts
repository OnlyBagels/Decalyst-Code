export type Mode = "idle" | "plan" | "execute" | "review" | "done" | "failed";

export interface ModeBudgets {
  maxFixRounds: number;
  swarmConcurrency: number;
  maxToolCallsPerTurn: number;
  maxWebFetchesPerRun: number;
  wallClockMs: number;
}

export interface ModeState {
  current: Mode;
  fixRound: number;
  startedAt: number;
  toolCallsThisTurn: number;
  webFetchesThisRun: number;
}
