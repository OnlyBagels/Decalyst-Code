import { agentResultSchema } from "./schemas.js";
import { validateEdit } from "./validate-edit.js";
import { applyFullFileEdit } from "./apply-full-file.js";
import { FileManager } from "../files/file-manager.js";
import { toMessage } from "../utils/errors.js";
import type { AgentTask, AgentResult, PatchResult } from "../types/agent.js";

export class PatchManager {
  constructor(private readonly fm: FileManager) {}

  async validateAndApply(task: AgentTask, raw: unknown): Promise<PatchResult> {
    const base: Omit<
      PatchResult,
      "editsApplied" | "rejectedEdits" | "validationErrors"
    > = {
      taskId: task.id,
      accepted: false,
      applied: false,
      formatted: false,
      rolledBack: false,
    };

    // 1. Zod schema validation
    const parsed = agentResultSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ...base,
        editsApplied: [],
        rejectedEdits: [],
        validationErrors: parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ),
      };
    }

    const result: AgentResult = parsed.data;

    // 2. taskId and role sanity checks
    const validationErrors: string[] = [];
    if (result.taskId !== task.id) {
      validationErrors.push(
        `taskId mismatch: expected ${task.id}, got ${result.taskId}`,
      );
    }
    if (result.role !== task.role) {
      validationErrors.push(
        `role mismatch: expected ${task.role}, got ${result.role}`,
      );
    }
    if (result.status === "cannot_complete") {
      validationErrors.push(
        `Worker reported cannot_complete: ${result.blockers.join("; ")}`,
      );
    }

    if (validationErrors.length > 0) {
      return { ...base, editsApplied: [], rejectedEdits: [], validationErrors };
    }

    // 3. Per-edit validation
    const acceptedEdits = result.edits.filter((edit) => {
      const v = validateEdit(edit, task);
      return v.valid;
    });

    const rejectedEdits = result.edits
      .map((edit) => ({ edit, result: validateEdit(edit, task) }))
      .filter(({ result: r }) => !r.valid)
      .map(({ edit, result: r }) => ({
        path: edit.path,
        reason: r.reason ?? "unknown",
      }));

    if (acceptedEdits.length === 0 && result.edits.length > 0) {
      return {
        ...base,
        editsApplied: [],
        rejectedEdits,
        validationErrors: ["All edits rejected"],
      };
    }

    // 4. Snapshot before writing
    const snapshot = await this.fm.snapshot(acceptedEdits.map((e) => e.path));

    // 5. Apply edits atomically
    const editsApplied: PatchResult["editsApplied"] = [];

    try {
      for (const edit of acceptedEdits) {
        const applied = await applyFullFileEdit(edit, this.fm);
        editsApplied.push(applied);
      }

      return {
        taskId: task.id,
        accepted: true,
        applied: true,
        editsApplied,
        rejectedEdits,
        validationErrors: [],
        formatted: false,
        rolledBack: false,
      };
    } catch (err) {
      await this.fm.restore(snapshot);
      return {
        taskId: task.id,
        accepted: true,
        applied: false,
        editsApplied: [],
        rejectedEdits,
        validationErrors: [`Apply error (rolled back): ${toMessage(err)}`],
        formatted: false,
        rolledBack: true,
      };
    }
  }
}
