import type { ZodSchema, ZodTypeAny } from "zod";
import type { ToolDef } from "../tools/schemas.js";
import type { ToolSpec } from "../models/model-client.js";

type JsonSchema = Record<string, unknown>;

function zodToJsonSchema(schema: ZodTypeAny): JsonSchema {
  const def = schema._def as Record<string, unknown>;
  const typeName = def["typeName"] as string | undefined;

  switch (typeName) {
    case "ZodString":
      return buildStringSchema(def);
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodArray": {
      const items = def["type"] as ZodTypeAny | undefined;
      return {
        type: "array",
        items: items ? zodToJsonSchema(items) : {},
      };
    }
    case "ZodEnum": {
      const values = def["values"] as unknown[];
      return { type: "string", enum: values };
    }
    case "ZodNativeEnum": {
      const enumValues = def["values"] as Record<string, unknown>;
      const vals = Object.values(enumValues).filter((v) => typeof v === "string");
      return { type: "string", enum: vals };
    }
    case "ZodOptional": {
      const inner = def["innerType"] as ZodTypeAny;
      return zodToJsonSchema(inner);
    }
    case "ZodDefault": {
      const inner = def["innerType"] as ZodTypeAny;
      const defaultValue = def["defaultValue"] as (() => unknown) | undefined;
      const base = zodToJsonSchema(inner);
      return defaultValue !== undefined
        ? { ...base, default: defaultValue() }
        : base;
    }
    case "ZodObject": {
      return buildObjectSchema(def);
    }
    case "ZodUnion": {
      const options = def["options"] as ZodTypeAny[];
      return { anyOf: options.map(zodToJsonSchema) };
    }
    case "ZodLiteral": {
      const value = def["value"] as unknown;
      return { const: value };
    }
    case "ZodNull":
      return { type: "null" };
    case "ZodAny":
    case "ZodUnknown":
      return {};
    default:
      return {};
  }
}

function buildStringSchema(def: Record<string, unknown>): JsonSchema {
  const schema: JsonSchema = { type: "string" };
  const checks = def["checks"] as Array<{ kind: string; value?: unknown; regex?: { source: string; flags: string } }> | undefined;
  if (!checks) return schema;
  for (const check of checks) {
    if (check.kind === "min") schema["minLength"] = check.value;
    if (check.kind === "max") schema["maxLength"] = check.value;
    if (check.kind === "regex" && check.regex) {
      schema["pattern"] = check.regex.source;
    }
  }
  return schema;
}

function buildObjectSchema(def: Record<string, unknown>): JsonSchema {
  const shape = def["shape"] as (() => Record<string, ZodTypeAny>) | undefined;
  if (!shape) return { type: "object" };

  const resolved = shape();
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];

  for (const [key, fieldSchema] of Object.entries(resolved)) {
    const fieldDef = (fieldSchema as ZodTypeAny)._def as Record<string, unknown>;
    const isOptional =
      fieldDef["typeName"] === "ZodOptional" ||
      fieldDef["typeName"] === "ZodDefault";

    properties[key] = zodToJsonSchema(fieldSchema as ZodTypeAny);
    if (!isOptional) {
      required.push(key);
    }
  }

  const result: JsonSchema = { type: "object", properties };
  if (required.length > 0) {
    result["required"] = required;
  }
  return result;
}

export function zodSchemaToJsonSchema(schema: ZodSchema): Record<string, unknown> {
  return zodToJsonSchema(schema as ZodTypeAny);
}

export function toolDefToToolSpec(def: ToolDef): ToolSpec {
  return {
    name: def.name,
    description: def.description,
    parameters: zodSchemaToJsonSchema(def.schema),
  };
}
