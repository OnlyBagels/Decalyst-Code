import { describe, it, expect } from "vitest";
import { assertPathAllowed } from "../src/files/path-policy.js";
import { PathPolicyError } from "../src/utils/errors.js";

describe("path-policy", () => {
  it("allows source files in any language", () => {
    expect(() => assertPathAllowed("src/server.ts")).not.toThrow();
    expect(() => assertPathAllowed("src/main.py")).not.toThrow();
    expect(() => assertPathAllowed("src/main.rs")).not.toThrow();
    expect(() => assertPathAllowed("cmd/cli/main.go")).not.toThrow();
    expect(() => assertPathAllowed("app/controllers/users.rb")).not.toThrow();
  });

  it("allows tests in any common layout", () => {
    expect(() => assertPathAllowed("tests/api.test.ts")).not.toThrow();
    expect(() => assertPathAllowed("test/api.test.ts")).not.toThrow();
    expect(() => assertPathAllowed("spec/users_spec.rb")).not.toThrow();
    expect(() => assertPathAllowed("__tests__/foo.spec.js")).not.toThrow();
  });

  it("allows project manifests across package managers", () => {
    expect(() => assertPathAllowed("package.json")).not.toThrow();
    expect(() => assertPathAllowed("tsconfig.json")).not.toThrow();
    expect(() => assertPathAllowed("Cargo.toml")).not.toThrow();
    expect(() => assertPathAllowed("pyproject.toml")).not.toThrow();
    expect(() => assertPathAllowed("go.mod")).not.toThrow();
    expect(() => assertPathAllowed("Gemfile")).not.toThrow();
    expect(() => assertPathAllowed("README.md")).not.toThrow();
    expect(() => assertPathAllowed(".env.example")).not.toThrow();
  });

  it("allows arbitrary top-level files", () => {
    expect(() => assertPathAllowed("random.txt")).not.toThrow();
    expect(() => assertPathAllowed("notes.md")).not.toThrow();
    expect(() => assertPathAllowed("Dockerfile")).not.toThrow();
    expect(() => assertPathAllowed(".github/workflows/ci.yml")).not.toThrow();
  });

  it("rejects path traversal", () => {
    expect(() => assertPathAllowed("../package.json")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("src/../../etc/passwd")).toThrow(
      PathPolicyError,
    );
  });

  it("rejects absolute paths", () => {
    expect(() => assertPathAllowed("/etc/passwd")).toThrow(PathPolicyError);
    expect(() =>
      assertPathAllowed("C:\\Windows\\System32\\config\\sam"),
    ).toThrow(PathPolicyError);
  });

  it("rejects secrets, VCS state, build output, and locks", () => {
    expect(() => assertPathAllowed(".env")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".env.production")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("node_modules/foo.ts")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed("dist/server.js")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("build/output.js")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("coverage/lcov.info")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed(".git/config")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("package-lock.json")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed("pnpm-lock.yaml")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("yarn.lock")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".ssh/id_rsa")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed(".aws/credentials")).toThrow(
      PathPolicyError,
    );
    expect(() => assertPathAllowed("id_rsa")).toThrow(PathPolicyError);
    expect(() => assertPathAllowed("id_rsa.pub")).toThrow(PathPolicyError);
  });
});
