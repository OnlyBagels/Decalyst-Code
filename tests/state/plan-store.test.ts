import { describe, it, expect, vi, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlanStore } from "../../src/state/plan-store.js";
import { EventBus } from "../../src/events/bus.js";

describe("PlanStore", () => {
  afterEach(async () => {
    const tmpDir = path.join(process.cwd(), ".test-plan-store");
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("set persists to disk when tracesDir provided", async () => {
    const bus = new EventBus();
    const store = new PlanStore(bus);
    const tmpDir = path.join(process.cwd(), ".test-plan-store");

    const plan = { phase: 1, tasks: ["a", "b"] };
    await store.set(plan, tmpDir);

    const planPath = path.join(tmpDir, "plan.json");
    const content = await fs.readFile(planPath, "utf8");
    const parsed = JSON.parse(content);

    expect(parsed).toEqual(plan);
  });

  it("emits plan_updated", async () => {
    const bus = new EventBus();
    const store = new PlanStore(bus);
    const emitSpy = vi.spyOn(bus, "emit");

    const plan = { phase: 1 };
    await store.set(plan);

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "plan_updated",
        plan,
      }),
    );
  });

  it("get returns current plan", async () => {
    const bus = new EventBus();
    const store = new PlanStore(bus);

    expect(store.get()).toBe(null);

    const plan = { phase: 1 };
    await store.set(plan);

    expect(store.get()).toEqual(plan);
  });
});
