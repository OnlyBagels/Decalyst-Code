import * as crypto from "node:crypto";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
