import { describe, it, expect, vi } from "vitest";
import { TodoStore } from "../../src/state/todos.js";
import { EventBus } from "../../src/events/bus.js";

describe("TodoStore", () => {
  it("replace sets todos and emits todo_changed", () => {
    const bus = new EventBus();
    const store = new TodoStore(bus);
    const emitSpy = vi.spyOn(bus, "emit");

    store.replace([
      { id: "1", description: "Task 1" },
      { id: "2", description: "Task 2", status: "in_progress" },
    ]);

    expect(store.list()).toHaveLength(2);
    expect(store.get("1")).toMatchObject({
      id: "1",
      description: "Task 1",
      status: "pending",
    });

    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "todo_changed",
      }),
    );
  });

  it("update mutates and emits", () => {
    const bus = new EventBus();
    const store = new TodoStore(bus);
    const emitSpy = vi.spyOn(bus, "emit");

    store.replace([{ id: "1", description: "Task 1" }]);
    emitSpy.mockClear();

    const updated = store.update("1", { status: "done" });

    expect(updated).toBe(true);
    expect(store.get("1")).toMatchObject({
      status: "done",
      description: "Task 1",
    });
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        t: "todo_changed",
      }),
    );
  });

  it("update on missing id returns false", () => {
    const bus = new EventBus();
    const store = new TodoStore(bus);
    const emitSpy = vi.spyOn(bus, "emit");

    const updated = store.update("nonexistent", { status: "done" });

    expect(updated).toBe(false);
    expect(emitSpy).not.toHaveBeenCalled();
  });

  it("list returns ordered todos", () => {
    const bus = new EventBus();
    const store = new TodoStore(bus);

    store.replace([
      { id: "3", description: "Third" },
      { id: "1", description: "First" },
      { id: "2", description: "Second" },
    ]);

    const todos = store.list();
    expect(todos).toHaveLength(3);
    expect(todos.map((t) => t.id)).toEqual(["3", "1", "2"]);
  });
});
