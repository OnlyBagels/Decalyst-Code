import { describe, it, expect } from "vitest";
import { FileLocks } from "../../src/tools/locks.js";

describe("FileLocks", () => {
  it("serializes concurrent invokes on the same path", async () => {
    const locks = new FileLocks();
    const order: string[] = [];

    const a = locks.withLock(["a.ts"], async () => {
      order.push("a-start");
      await new Promise((r) => setTimeout(r, 20));
      order.push("a-end");
    });

    const b = locks.withLock(["a.ts"], async () => {
      order.push("b-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("b-end");
    });

    await Promise.all([a, b]);
    expect(order).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("runs concurrent invokes on disjoint paths in parallel", async () => {
    const locks = new FileLocks();
    const started: number[] = [];

    const a = locks.withLock(["x.ts"], async () => {
      started.push(Date.now());
      await new Promise((r) => setTimeout(r, 30));
    });

    const b = locks.withLock(["y.ts"], async () => {
      started.push(Date.now());
      await new Promise((r) => setTimeout(r, 30));
    });

    await Promise.all([a, b]);
    expect(started).toHaveLength(2);
    // Both start within 15ms of each other, confirming parallel execution
    expect(Math.abs(started[1]! - started[0]!)).toBeLessThan(15);
  });

  it("prevents deadlock when two callers request the same paths in different orders", async () => {
    const locks = new FileLocks();
    let count = 0;

    const a = locks.withLock(["file-a.ts", "file-b.ts"], async () => {
      count++;
      await new Promise((r) => setTimeout(r, 10));
    });

    const b = locks.withLock(["file-b.ts", "file-a.ts"], async () => {
      count++;
      await new Promise((r) => setTimeout(r, 10));
    });

    await Promise.all([a, b]);
    expect(count).toBe(2);
  });

  it("releases the lock when the handler throws", async () => {
    const locks = new FileLocks();

    await expect(
      locks.withLock(["err.ts"], async () => {
        throw new Error("handler blew up");
      }),
    ).rejects.toThrow("handler blew up");

    let ran = false;
    await locks.withLock(["err.ts"], async () => {
      ran = true;
    });
    expect(ran).toBe(true);
  });
});
