import * as path from "node:path";
import { PathPolicyError } from "../utils/errors.js";

const ALLOWED_PATTERNS: RegExp[] = [
  /^src[\\/]/,
  /^test[\\/]/,
  /^tests[\\/]/,
  /^README\.md$/,
  /^package\.json$/,
  /^tsconfig\.json$/,
  /^eslint\.config\./,
  /^vitest\.config\./,
  /^\.env\.example$/,
];

const FORBIDDEN_PATTERNS: RegExp[] = [
  /^\.env($|\.(?!example))/,
  /^\.git[\\/]/,
  /node_modules/,
  /^dist[\\/]/,
  /^build[\\/]/,
  /^coverage[\\/]/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^Dockerfile/,
  /^\.github[\\/]/,
];

/**
 * Normalizes a path relative to workspace root and asserts it is on the allowlist.
 * Throws PathPolicyError for any path that is forbidden or traverses outside root.
 */
export function assertPathAllowed(rawPath: string): string {
  const normalized = normalizePath(rawPath);

  // Prevent directory traversal
  if (normalized.includes("..")) {
    throw new PathPolicyError(`Path traversal detected: "${rawPath}"`);
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new PathPolicyError(
        `Path is forbidden: "${rawPath}" (matched ${pattern})`,
      );
    }
  }

  const allowed = ALLOWED_PATTERNS.some((p) => p.test(normalized));
  if (!allowed) {
    throw new PathPolicyError(
      `Path is not on the allowlist: "${rawPath}". Allowed: src/**, test/**, tests/**, README.md, package.json, tsconfig.json, eslint.config.*, vitest.config.*, .env.example`,
    );
  }

  return normalized;
}

export function normalizePath(rawPath: string): string {
  // Normalize separators to forward slashes, remove leading ./
  return path.normalize(rawPath).replace(/\\/g, "/").replace(/^\.\//, "");
}

export function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
): string {
  const normalized = normalizePath(relativePath);
  return path.resolve(workspaceRoot, normalized);
}
