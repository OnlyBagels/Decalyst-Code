import type { ChatMessage } from "../../models/model-client.js";

const STABLE_MARKERS = [
  "# instructions",
  "## instructions",
  "# system",
  "## system",
  "# schema",
  "## schema",
  "you are",
  "your role",
  "your task",
];

function looksStable(text: string): boolean {
  const lower = text.toLowerCase();
  return STABLE_MARKERS.some((m) => lower.includes(m));
}

function splitStableVariable(content: string): { stable: string; variable: string } | null {
  const lines = content.split("\n");

  // Find the boundary: first heading or blank line that separates a stable block
  // from more dynamic content below. We look for a "current state" / "context" section.
  const variableMarkers = ["# current", "## current", "# context", "## context", "# state", "## state"];
  let splitIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const lower = (lines[i] ?? "").toLowerCase().trim();
    if (variableMarkers.some((m) => lower.startsWith(m))) {
      splitIdx = i;
      break;
    }
  }

  if (splitIdx <= 0) return null;

  const stable = lines.slice(0, splitIdx).join("\n").trim();
  const variable = lines.slice(splitIdx).join("\n").trim();
  if (!stable || !variable) return null;

  return { stable, variable };
}

export class CacheAligner {
  alignPrompt(messages: ChatMessage[]): ChatMessage[] {
    if (messages.length === 0) return messages;

    const result: ChatMessage[] = [];
    let i = 0;

    // Collect leading system messages and optimize them
    while (i < messages.length && messages[i]!.role === "system") {
      const msg = messages[i]!;

      if (!looksStable(msg.content)) {
        result.push(msg);
        i++;
        continue;
      }

      const split = splitStableVariable(msg.content);
      if (split) {
        result.push({ role: "system", content: split.stable });
        result.push({ role: "system", content: split.variable });
      } else {
        result.push(msg);
      }
      i++;
    }

    // Append remaining messages unchanged
    while (i < messages.length) {
      result.push(messages[i]!);
      i++;
    }

    return result;
  }
}
