import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { EventBus } from "../events/bus.js";

export class PlanStore {
  private current: unknown | null = null;

  constructor(private bus: EventBus) {}

  async set(plan: unknown, tracesDir?: string): Promise<void> {
    this.current = plan;
    if (tracesDir) {
      const planPath = path.join(tracesDir, "plan.json");
      await fs.mkdir(tracesDir, { recursive: true });
      await fs.writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");
    }
    this.bus.emit({
      t: "plan_updated",
      plan,
    });
  }

  get(): unknown | null {
    return this.current;
  }
}
