import { describe, it, expect } from "vitest";
import { assertPathAllowed } from "../src/files/path-policy.js";
import { PathPolicyError } from "../src/utils/errors.js";

describe("path-policy", () => {
  it("allows src files", () => {
    expect(() => assertPathAllowed("src/server.ts")).not.toThrow();
    expect(() => assertPathAllowed("src/routes/users.ts")).not.toThrow();
  });

  it("allows tests files", () => {
    expect(() => assertPathAllowed("tests/api.test.ts")).not.toThrow();
    expect(() => assertPathAllowed("test/api.test.ts")).not.toThrow();
  });

  it("allows top-level config", () => {
    expect(() => assertPathAllowed("package.json")).not.toThrow();
    expect(() => assertPathAllowed("tsconfig.json")).not.toThrow();
    expect(() => assertPathAllowed("README.md")).not.toThrow();
    expect(() => assertPathAllowed(".env.example")).not.toThrow();
  });

  it("rejects path traversal", () => {
    expect(() => assertPathAllowed("../package.json")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("src/../../etc/passwd")).toThrow(
      PathPolicyError,
    );
  });

  it("rejects forbidden paths", () => {
    expect(() => assertPathAllowed(".env")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".env.production")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("node_modules/foo.ts")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed("dist/server.js")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".git/config")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("package-lock.json")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed("Dockerfile")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".github/workflows/ci.yml")).toThrow(
      PathPolicyError,
    );
  });

  it("rejects unrelated top-level files", () => {
    expect(() => assertPathAllowed("random.txt")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("notes.md")).toThrow(PathPolicyError);
  });
});
