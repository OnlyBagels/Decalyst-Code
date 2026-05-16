import * as path from "node:path";
import { PathPolicyError } from "../utils/errors.js";

// Denylist — block paths that contain secrets, VCS state, build output,
// dependencies, or other system files. Everything else is allowed.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /^\.env($|\.(?!example))/,
  /^\.git[\\/]/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /^dist[\\/]/,
  /^build[\\/]/,
  /^coverage[\\/]/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^\.ssh[\\/]/,
  /^\.aws[\\/]/,
  /^id_rsa($|\.)/,
];

/**
 * Normalizes a path relative to workspace root and asserts it is allowed.
 * Uses a denylist: blocks secrets, VCS, build output, and lock files; allows
 * any other path (any extension, any directory).
 */
export function assertPathAllowed(rawPath: string): string {
  const normalized = normalizePath(rawPath);

  // Prevent directory traversal
  if (normalized.includes("..")) {
    throw new PathPolicyError(`Path traversal detected: "${rawPath}"`);
  }

  // Prevent absolute paths
  if (path.isAbsolute(normalized) || /^[a-zA-Z]:[\\/]/.test(normalized)) {
    throw new PathPolicyError(`Absolute paths not allowed: "${rawPath}"`);
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new PathPolicyError(
        `Path is forbidden: "${rawPath}" (matched ${pattern})`,
      );
    }
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
