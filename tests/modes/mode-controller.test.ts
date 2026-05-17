import { describe, it, expect, beforeEach } from "vitest";
import { EventBus } from "../../src/events/bus.js";
import {
  ModeController,
  type ModeBudgets,
  type Mode,
} from "../../src/modes/index.js";
import { ModeError, BudgetExceededError } from "../../src/modes/errors.js";

describe("ModeController", () => {
  let bus: EventBus;
  let controller: ModeController;
  let budgets: ModeBudgets;

  beforeEach(() => {
    bus = new EventBus();
    budgets = {
      maxFixRounds: 3,
      swarmConcurrency: 5,
      maxToolCallsPerTurn: 10,
      maxWebFetchesPerRun: 20,
      wallClockMs: 3600000,
    };
    controller = new ModeController(bus, budgets);
  });

  describe("initialization", () => {
    it("starts in idle mode", () => {
      expect(controller.current).toBe("idle");
    });

    it("has zero fix rounds initially", () => {
      expect(controller.state$.fixRound).toBe(0);
    });

    it("has zero tool calls and web fetches initially", () => {
      const state = controller.state$;
      expect(state.toolCallsThisTurn).toBe(0);
      expect(state.webFetchesThisRun).toBe(0);
    });
  });

  describe("legal transitions", () => {
    it("transitions idle -> plan", async () => {
      let emitted = false;
      bus.on("mode_change", (event) => {
        if (event.mode === "plan") emitted = true;
      });

      await controller.transition("plan");

      expect(controller.current).toBe("plan");
      expect(emitted).toBe(true);
    });

    it("transitions plan -> execute", async () => {
      await controller.transition("plan");
      await controller.transition("execute");

      expect(controller.current).toBe("execute");
    });

    it("transitions execute -> review", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("review");

      expect(controller.current).toBe("review");
    });

    it("transitions review -> plan and increments fix round", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("review");

      const roundBefore = controller.state$.fixRound;
      await controller.transition("plan");

      expect(controller.current).toBe("plan");
      expect(controller.state$.fixRound).toBe(roundBefore + 1);
    });

    it("transitions review -> done", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("review");
      await controller.transition("done");

      expect(controller.current).toBe("done");
    });

    it("transitions review -> failed", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("review");
      await controller.transition("failed");

      expect(controller.current).toBe("failed");
    });

    it("transitions plan -> failed", async () => {
      await controller.transition("plan");
      await controller.transition("failed");

      expect(controller.current).toBe("failed");
    });

    it("transitions execute -> failed", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("failed");

      expect(controller.current).toBe("failed");
    });

    it("transitions idle -> failed", async () => {
      await controller.transition("failed");

      expect(controller.current).toBe("failed");
    });
  });

  describe("illegal transitions", () => {
    it("throws on idle -> execute", async () => {
      await expect(controller.transition("execute")).rejects.toThrow(ModeError);
    });

    it("throws on idle -> review", async () => {
      await expect(controller.transition("review")).rejects.toThrow(ModeError);
    });

    it("throws on idle -> done", async () => {
      await expect(controller.transition("done")).rejects.toThrow(ModeError);
    });

    it("throws on plan -> plan", async () => {
      await controller.transition("plan");
      await expect(controller.transition("plan")).rejects.toThrow(ModeError);
    });

    it("throws on execute -> plan", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await expect(controller.transition("plan")).rejects.toThrow(ModeError);
    });

    it("includes from and to in ModeError", async () => {
      try {
        await controller.transition("execute");
      } catch (e) {
        const err = e as ModeError;
        expect(err.from).toBe("idle");
        expect(err.to).toBe("execute");
      }
    });
  });

  describe("canCallTool", () => {
    it("returns true when current mode is in toolModes", async () => {
      await controller.transition("plan");
      expect(controller.canCallTool(["plan", "execute"])).toBe(true);
    });

    it("returns false when current mode is not in toolModes", async () => {
      await controller.transition("plan");
      expect(controller.canCallTool(["execute", "review"])).toBe(false);
    });

    it("returns false when toolModes is empty", async () => {
      await controller.transition("plan");
      expect(controller.canCallTool([])).toBe(false);
    });
  });

  describe("fix round management", () => {
    it("detects when fix rounds are exhausted", async () => {
      await controller.transition("plan");
      await controller.transition("execute");
      await controller.transition("review");

      for (let i = 0; i < budgets.maxFixRounds; i++) {
        expect(controller.isFixerRoundsExhausted()).toBe(false);
        await controller.transition("plan");
        await controller.transition("execute");
        await controller.transition("review");
      }

      expect(controller.isFixerRoundsExhausted()).toBe(true);
    });

    it("allows manual increment of fix round", () => {
      const before = controller.state$.fixRound;
      controller.incrementFixerRound();
      expect(controller.state$.fixRound).toBe(before + 1);
    });
  });

  describe("turn counter management", () => {
    it("resets tool calls on resetTurnCounters", async () => {
      await controller.transition("plan");
      controller.recordToolCall("test");
      controller.recordToolCall("test");

      expect(controller.state$.toolCallsThisTurn).toBe(2);

      controller.resetTurnCounters();
      expect(controller.state$.toolCallsThisTurn).toBe(0);
    });
  });

  describe("tool call recording", () => {
    it("increments tool call counter", async () => {
      await controller.transition("plan");

      controller.recordToolCall("tool1");
      expect(controller.state$.toolCallsThisTurn).toBe(1);

      controller.recordToolCall("tool2");
      expect(controller.state$.toolCallsThisTurn).toBe(2);
    });

    it("throws BudgetExceededError when maxToolCallsPerTurn exceeded", async () => {
      await controller.transition("plan");

      for (let i = 0; i < budgets.maxToolCallsPerTurn; i++) {
        controller.recordToolCall("tool");
      }

      expect(() => controller.recordToolCall("tool")).toThrow(
        BudgetExceededError,
      );
    });

    it("includes budget name in BudgetExceededError", async () => {
      await controller.transition("plan");

      for (let i = 0; i < budgets.maxToolCallsPerTurn; i++) {
        controller.recordToolCall("tool");
      }

      try {
        controller.recordToolCall("tool");
      } catch (e) {
        const err = e as BudgetExceededError;
        expect(err.budgetName).toBe("maxToolCallsPerTurn");
      }
    });
  });

  describe("web fetch recording", () => {
    it("increments web fetch counter", () => {
      controller.recordWebFetch();
      expect(controller.state$.webFetchesThisRun).toBe(1);

      controller.recordWebFetch();
      expect(controller.state$.webFetchesThisRun).toBe(2);
    });

    it("throws BudgetExceededError when maxWebFetchesPerRun exceeded", () => {
      for (let i = 0; i < budgets.maxWebFetchesPerRun; i++) {
        controller.recordWebFetch();
      }

      expect(() => controller.recordWebFetch()).toThrow(BudgetExceededError);
    });

    it("includes budget name in BudgetExceededError", () => {
      for (let i = 0; i < budgets.maxWebFetchesPerRun; i++) {
        controller.recordWebFetch();
      }

      try {
        controller.recordWebFetch();
      } catch (e) {
        const err = e as BudgetExceededError;
        expect(err.budgetName).toBe("maxWebFetchesPerRun");
      }
    });
  });

  describe("wall clock expiration", () => {
    it("returns false for wall clock expiration when time remains", () => {
      expect(controller.isWallClockExpired()).toBe(false);
    });

    it("returns true when wall clock has expired", async () => {
      const controllerExpired = new ModeController(bus, {
        ...budgets,
        wallClockMs: 1,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(controllerExpired.isWallClockExpired()).toBe(true);
    });
  });

  describe("state immutability", () => {
    it("returns frozen copy of state", async () => {
      const state = controller.state$;
      expect(() => {
        (state as any).current = "plan";
      }).toThrow();
    });
  });

  describe("event emission", () => {
    it("emits mode_change event on transition", async () => {
      let events: Mode[] = [];
      bus.on("mode_change", (event) => {
        events.push(event.mode);
      });

      await controller.transition("plan");
      await controller.transition("execute");

      expect(events).toEqual(["plan", "execute"]);
    });
  });

  describe("state$.startedAt", () => {
    it("records start time", () => {
      const before = Date.now();
      const ctrl = new ModeController(bus, budgets);
      const after = Date.now();

      expect(ctrl.state$.startedAt).toBeGreaterThanOrEqual(before);
      expect(ctrl.state$.startedAt).toBeLessThanOrEqual(after);
    });
  });
});
