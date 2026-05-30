#!/usr/bin/env node
// UserPromptSubmit hook: when a prompt looks like implementation work, inject the
// ai-coding-router routing playbook so the swarm/model choice is considered every
// time — without forcing it. Stays silent on questions, chat, and trivial asks.
//
// Reads the hook JSON on stdin ({ prompt, ... }); prints guidance to stdout, which
// the harness adds to context. Always exits 0 (a hook error must never block work).

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    emit(raw);
  } catch {
    // never block on a hook failure
  }
  process.exit(0);
});

function emit(raw) {
  const prompt = safePrompt(raw);
  if (!prompt) return;

  // Implementation intent: building/changing code, not asking about it.
  const impl =
    /\b(implement|build|scaffold|refactor|rewrite|migrat\w*|port|wire up|set up|generate)\b/i.test(prompt) ||
    /\b(add|create|write|make|fix|update)\b[^.?!]*\b(feature|component|endpoint|route|module|service|api|crud|page|screen|function|class|hook|store|schema|model|migration|command|cli|test|tests|suite|script|integration)\b/i.test(prompt);

  if (!impl) return;

  // Risk signal: keep these OFF the cheap swarm regardless.
  const risky =
    /\b(crypto|encrypt|decrypt|e2ee|mls|signal protocol|opaque|key(s)?|secret|token|auth\w*|login|session|password|payment|billing|stripe|migration|schema change|permission|access control|rbac|sandbox|deserializ)/i.test(prompt);

  const lines = [
    "[ai-coding-router] This looks like implementation work. Route it before writing code (cheap -> expensive):",
    "- BULK / greenfield / many independent files / scaffolding -> invoke the **swarm-build** skill: it plans the files and runs the bulk swarm (DeepSeek V4 Flash + MiMo V2.5) in parallel.",
    "- HARDER / important files -> upgrade the swarm to the Pros (DeepSeek V4 Pro + MiMo V2.5-Pro).",
    "- SERIOUS / architectural single change -> Claude Sonnet.",
    "- TRIVIAL single edit -> just do it inline; don't over-orchestrate.",
    "- FINAL review of the finished work -> 3-model panel (Opus 4.8 + DeepSeek V4 Pro + MiMo V2.5-Pro); you (Opus) reconcile and make the call.",
  ];
  if (risky) {
    lines.push(
      "- !! RISK SIGNAL in this prompt (security / crypto / auth / payments / migrations). Do NOT route this to the cheap swarm. Keep it on Sonnet, Opus final review. No plaintext fallback, no fake security.",
    );
  }
  lines.push("- Invoke the ai-coding-router skill for the full routing table and the swarm-exec contract.");

  process.stdout.write(lines.join("\n") + "\n");
}

function safePrompt(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const obj = JSON.parse(trimmed);
    return typeof obj.prompt === "string" ? obj.prompt : "";
  } catch {
    // Not JSON (older/!shapes) — treat the whole stdin as the prompt text.
    return trimmed;
  }
}
