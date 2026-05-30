import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export class Scratchpad {
  private readonly filePath: string;

  constructor(opts: { tracesDir: string }) {
    this.filePath = path.join(opts.tracesDir, "scratchpad.md");
  }

  async read(): Promise<string> {
    try {
      return await fs.readFile(this.filePath, "utf8");
    } catch {
      return "";
    }
  }

  async write(content: string): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });

    const tmpFile = path.join(os.tmpdir(), `scratchpad-${Date.now()}-${Math.random()}.tmp`);
    try {
      await fs.writeFile(tmpFile, content, "utf8");
      await fs.rename(tmpFile, this.filePath);
    } catch {
      try {
        await fs.unlink(tmpFile);
      } catch {
        // ignore cleanup failure
      }
      throw new Error(`Failed to write scratchpad to ${this.filePath}`);
    }
  }

  async append(line: string): Promise<void> {
    const current = await this.read();
    const newContent = current ? `${current}\n${line}` : line;
    await this.write(newContent);
  }
}
