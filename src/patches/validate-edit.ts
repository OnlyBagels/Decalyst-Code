import { assertPathAllowed } from "../files/path-policy.js";
import { PathPolicyError, ValidationError } from "../utils/errors.js";
import type { FileEdit, AgentTask } from "../types/agent.js";

const MAX_CONTENT_BYTES = 512_000; // 512 KB hard ceiling per file

export interface EditValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateEdit(
  edit: FileEdit,
  task: AgentTask,
): EditValidationResult {
  // Path allowed
  try {
    assertPathAllowed(edit.path);
  } catch (err) {
    if (err instanceof PathPolicyError) {
      return { valid: false, reason: err.message };
    }
    throw err;
  }

  // Path must be in task targetFiles
  if (
    !task.targetFiles.includes(edit.path) &&
    !task.targetFiles.includes(normPath(edit.path))
  ) {
    return {
      valid: false,
      reason: `Edit targets "${edit.path}" which is not in task.targetFiles: [${task.targetFiles.join(", ")}]`,
    };
  }

  // Content must be a string (Zod ensures this, but double-check)
  if (typeof edit.fullContent !== "string") {
    return { valid: false, reason: "fullContent must be a string" };
  }

  // Size limit
  const bytes = Buffer.byteLength(edit.fullContent, "utf8");
  if (bytes > MAX_CONTENT_BYTES) {
    return {
      valid: false,
      reason: `File content too large: ${bytes} bytes exceeds ${MAX_CONTENT_BYTES}`,
    };
  }

  // Character limit from task limits
  if (edit.fullContent.length > task.limits.maxOutputChars) {
    return {
      valid: false,
      reason: `Output chars ${edit.fullContent.length} exceeds task limit ${task.limits.maxOutputChars}`,
    };
  }

  // No binary content (detect by NUL bytes)
  if (edit.fullContent.includes("\x00")) {
    return { valid: false, reason: "Binary content (NUL bytes) detected" };
  }

  return { valid: true };
}

export function assertEditValid(edit: FileEdit, task: AgentTask): void {
  const result = validateEdit(edit, task);
  if (!result.valid) {
    throw new ValidationError(result.reason ?? "Edit validation failed");
  }
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}
