export class SwarmError extends Error {
  public readonly originalCause?: unknown;
  constructor(message: string, originalCause?: unknown) {
    super(message);
    this.name = "SwarmError";
    this.originalCause = originalCause;
  }
}

export class ValidationError extends SwarmError {
  constructor(
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class PathPolicyError extends SwarmError {
  constructor(message: string) {
    super(message);
    this.name = "PathPolicyError";
  }
}

export class WorkerError extends SwarmError {
  constructor(
    message: string,
    public readonly taskId?: string,
  ) {
    super(message);
    this.name = "WorkerError";
  }
}

export class OrchestratorError extends SwarmError {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export function isError(val: unknown): val is Error {
  return val instanceof Error;
}

export function toMessage(val: unknown): string {
  if (isError(val)) return val.message;
  if (typeof val === "string") return val;
  return String(val);
}
