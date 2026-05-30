#!/usr/bin/env node
// Open a GitHub issue (or print a prefilled link) against the Decalyst-Code repo
// when the harness ITSELF misbehaves: the executor crashed, a flag did the wrong
// thing, the path policy blocked a legit file, verify misreported. Not for a model
// writing weak code — that is the orchestrator's review job.
//
// The orchestrator (your LLM) runs this from the swarm-build skill. Keys never
// leave the machine: the title and body are redacted before anything is sent.
//
// Usage:
//   node report-issue.mjs --title "swarm-exec: <short>" \
//        --body "what you ran / what happened / what you expected" \
//        [--kind bug|enhancement] [--result result.json] [--link-only]
//
// Primary path uses the `gh` CLI (works through the API even with issue forms on).
// If gh is missing or unauthed, it prints a prefilled URL for you to click — so a
// public issue is never opened without a human action in that case.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REPO = process.env.DECALYST_REPORT_REPO || "OnlyBagels/Decalyst-Code";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

const title = arg("title");
if (!title) {
  console.error(
    'usage: report-issue.mjs --title "..." [--body "..."] [--kind bug|enhancement] [--result result.json] [--link-only]',
  );
  process.exit(2);
}

const kind = arg("kind", "bug") === "enhancement" ? "enhancement" : "bug";
let body = arg("body", "");
const bodyFile = arg("body-file");
if (bodyFile) body = readFileSync(bodyFile, "utf8");

// Attach a sanitized run summary when a result.json is handed in.
const resultPath = arg("result");
if (resultPath) {
  try {
    const r = JSON.parse(readFileSync(resultPath, "utf8"));
    const summary = {
      backends: r.backends,
      applied: Array.isArray(r.applied) ? r.applied.length : r.applied,
      failed: r.failed,
      blocked: r.blocked,
      verifyPassed: r.verify?.passed,
      fixRounds: r.fixRounds,
    };
    body += `\n\n<details><summary>run summary</summary>\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n</details>`;
  } catch {
    // unreadable result.json is not worth failing the report over
  }
}

// Defense in depth: strip anything that looks like a credential before it ships.
function redact(s) {
  return String(s)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-REDACTED")
    .replace(/gh[pousr]_[A-Za-z0-9]{20,}/g, "gh-REDACTED")
    .replace(/(api[_-]?key\s*[=:]\s*)\S+/gi, "$1REDACTED")
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/g, "Bearer REDACTED");
}
const safeTitle = redact(title);
const safeBody = redact(body || "(no description provided)");

if (!flag("link-only")) {
  const gh = spawnSync(
    "gh",
    ["issue", "create", "--repo", REPO, "--title", safeTitle, "--body", safeBody, "--label", kind],
    { encoding: "utf8" },
  );
  if (gh.status === 0) {
    console.log(gh.stdout.trim());
    process.exit(0);
  }
}

// Fallback: prefilled URL. Truncate the body so the URL stays usable.
const q = new URLSearchParams({ title: safeTitle, body: safeBody.slice(0, 6000), labels: kind });
console.log("gh unavailable or not authed — open this to file the issue:");
console.log(`https://github.com/${REPO}/issues/new?${q.toString()}`);
