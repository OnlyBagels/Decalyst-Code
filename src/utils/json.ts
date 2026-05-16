import { SwarmError } from "./errors.js";

/**
 * Extracts the first complete JSON object from a raw string that may contain
 * markdown fences, prose, or other noise around the JSON.
 */
export function extractJsonObject(raw: string): unknown {
  const stripped = stripMarkdownFence(raw.trim());

  // Try direct parse first (happy path: model returned clean JSON)
  const direct = tryParse(stripped);
  if (direct !== undefined) return direct;

  // Scan for first '{' and find its matching '}'
  const start = stripped.indexOf("{");
  if (start === -1) {
    throw new SwarmError(
      `No JSON object found in response. Raw (truncated): ${raw.slice(0, 200)}`,
    );
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = stripped.slice(start, i + 1);
        const parsed = tryParse(candidate);
        if (parsed !== undefined) return parsed;
      }
    }
  }

  throw new SwarmError(
    `Could not extract valid JSON from response. Raw (truncated): ${raw.slice(0, 200)}`,
  );
}

function stripMarkdownFence(s: string): string {
  return s
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export function safeStringify(value: unknown, indent = 2): string {
  return JSON.stringify(value, null, indent);
}
