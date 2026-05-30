import { describe, it, expect } from "vitest";
import { planToTasks, buildProjectContext } from "../src/core/run-session.js";
import { parseProjectPlan } from "../src/core/plan-input.js";

describe("parseProjectPlan passthrough", () => {
  it("carries contract and per-file group", () => {
    const plan = parseProjectPlan({
      projectName: "x",
      contract: "Note { content: string }",
      files: [{ path: "a.ts", purpose: "p", group: "g" }],
      constraints: [],
    });
    expect(plan.contract).toBe("Note { content: string }");
    expect(plan.files[0]?.group).toBe("g");
  });
});

describe("planToTasks grouping + contract", () => {
  it("groups files sharing a group into one task and remaps deps to the group", () => {
    const plan = parseProjectPlan({
      projectName: "x",
      contract: "Note has content:string; store exposes list/get/create/update/remove",
      files: [
        { path: "src/types.ts", purpose: "types", group: "data" },
        { path: "src/store.ts", purpose: "store", group: "data", dependsOn: ["src/types.ts"] },
        { path: "src/routes.ts", purpose: "routes", dependsOn: ["src/store.ts"] },
      ],
      constraints: ["strict"],
    });
    const tasks = planToTasks(plan, buildProjectContext(plan));

    expect(tasks).toHaveLength(2);

    const data = tasks.find((t) => t.id === "data")!;
    expect(data.targetFiles.slice().sort()).toEqual(["src/store.ts", "src/types.ts"]);
    // intra-group dep (store -> types) is dropped
    expect(data.dependencies).toEqual([]);
    expect(data.limits.maxFilesToEdit).toBeGreaterThanOrEqual(2);

    const routes = tasks.find((t) => t.id === "src/routes.ts")!;
    // depends on store.ts, which lives in group "data"
    expect(routes.dependencies).toEqual(["data"]);
    // gets the data group's files as dependency context
    expect(routes.dependencyFiles?.slice().sort()).toEqual([
      "src/store.ts",
      "src/types.ts",
    ]);

    // contract is on every task (placed in the cached system-prompt prefix)
    expect(data.contract).toContain("store exposes list/get");
    expect(routes.contract).toContain("store exposes list/get");
  });

  it("adds plan.contextFiles to every task as read-only context (not deps)", () => {
    const plan = parseProjectPlan({
      projectName: "x",
      contextFiles: ["src/users/service.ts", "src/posts/service.ts"],
      files: [
        { path: "src/routes.ts", purpose: "routers", group: "http" },
        { path: "src/app.ts", purpose: "wire", group: "http" },
      ],
      constraints: [],
    });
    const tasks = planToTasks(plan, buildProjectContext(plan));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.dependencyFiles?.slice().sort()).toEqual([
      "src/posts/service.ts",
      "src/users/service.ts",
    ]);
    // context-only: no ordering dependency created
    expect(tasks[0]?.dependencies).toEqual([]);
  });

  it("leaves ungrouped files as one task each (back-compat)", () => {
    const plan = parseProjectPlan({
      projectName: "x",
      files: [
        { path: "a.ts", purpose: "a" },
        { path: "b.ts", purpose: "b", dependsOn: ["a.ts"] },
      ],
      constraints: [],
    });
    const tasks = planToTasks(plan, buildProjectContext(plan));
    expect(tasks.map((t) => t.id).slice().sort()).toEqual(["a.ts", "b.ts"]);
    expect(tasks.find((t) => t.id === "b.ts")!.dependencies).toEqual(["a.ts"]);
  });
});
