import { SwarmError } from "../utils/errors.js";
import type { Mode } from "./types.js";

export class ModeError extends SwarmError {
  constructor(
    message: string,
    public readonly from: Mode,
    public readonly to: Mode,
  ) {
    super(message);
    this.name = "ModeError";
  }
}

export class BudgetExceededError extends SwarmError {
  constructor(
    message: string,
    public readonly budgetName: string,
  ) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
