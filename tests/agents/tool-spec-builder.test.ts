import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toolDefToToolSpec, zodSchemaToJsonSchema } from "../../src/agents/tool-spec-builder.js";
import type { ToolDef } from "../../src/tools/schemas.js";

describe("zodSchemaToJsonSchema", () => {
  it("converts a string field", () => {
    const schema = z.object({ name: z.string() });
    const result = zodSchemaToJsonSchema(schema);
    expect(result).toMatchObject({
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    });
  });

  it("converts a number field", () => {
    const schema = z.object({ count: z.number() });
    const result = zodSchemaToJsonSchema(schema);
    expect(result["properties"]).toMatchObject({ count: { type: "number" } });
    expect(result["required"]).toContain("count");
  });

  it("converts a boolean field", () => {
    const schema = z.object({ flag: z.boolean() });
    const result = zodSchemaToJsonSchema(schema);
    expect(result["properties"]).toMatchObject({ flag: { type: "boolean" } });
  });

  it("converts an array field", () => {
    const schema = z.object({ tags: z.array(z.string()) });
    const result = zodSchemaToJsonSchema(schema);
    expect(result["properties"]).toMatchObject({
      tags: { type: "array", items: { type: "string" } },
    });
  });

  it("converts an enum field", () => {
    const schema = z.object({ role: z.enum(["admin", "user", "guest"]) });
    const result = zodSchemaToJsonSchema(schema);
    expect(result["properties"]).toMatchObject({
      role: { type: "string", enum: ["admin", "user", "guest"] },
    });
  });

  it("marks optional fields as not required", () => {
    const schema = z.object({
      required_field: z.string(),
      optional_field: z.string().optional(),
    });
    const result = zodSchemaToJsonSchema(schema);
    const required = result["required"] as string[];
    expect(required).toContain("required_field");
    expect(required).not.toContain("optional_field");
  });

  it("handles default fields as not required", () => {
    const schema = z.object({
      timeout: z.number().default(30),
    });
    const result = zodSchemaToJsonSchema(schema);
    const required = result["required"] as string[] | undefined;
    expect(required ?? []).not.toContain("timeout");
  });

  it("converts nested object", () => {
    const schema = z.object({
      meta: z.object({ version: z.string() }),
    });
    const result = zodSchemaToJsonSchema(schema);
    const props = result["properties"] as Record<string, unknown>;
    expect(props["meta"]).toMatchObject({
      type: "object",
      properties: { version: { type: "string" } },
    });
  });

  it("handles plain string schema", () => {
    const schema = z.string();
    const result = zodSchemaToJsonSchema(schema);
    expect(result).toMatchObject({ type: "string" });
  });
});

describe("toolDefToToolSpec", () => {
  it("maps name, description, and parameters", () => {
    const def: ToolDef = {
      name: "write_plan",
      description: "Write the plan to the scratchpad.",
      agent: "orchestrator",
      schema: z.object({ plan: z.string() }),
      handler: async () => undefined,
    };

    const spec = toolDefToToolSpec(def);
    expect(spec.name).toBe("write_plan");
    expect(spec.description).toBe("Write the plan to the scratchpad.");
    expect(spec.parameters).toMatchObject({
      type: "object",
      properties: { plan: { type: "string" } },
    });
  });

  it("produces a valid JSON Schema object with required array", () => {
    const def: ToolDef = {
      name: "dispatch_worker",
      description: "Dispatch a worker task.",
      agent: "orchestrator",
      schema: z.object({
        taskId: z.string(),
        goal: z.string(),
        priority: z.number().optional(),
      }),
      handler: async () => undefined,
    };

    const spec = toolDefToToolSpec(def);
    const required = spec.parameters["required"] as string[];
    expect(required).toContain("taskId");
    expect(required).toContain("goal");
    expect(required).not.toContain("priority");
  });
});
