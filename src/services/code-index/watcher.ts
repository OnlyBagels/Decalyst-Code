import { watch, type FSWatcher } from "chokidar";

const DEFAULT_IGNORED: RegExp[] = [
  /node_modules/,
  /\.git/,
  /[/\\]dist[/\\]/,
  /[/\\]build[/\\]/,
  /[/\\]coverage[/\\]/,
  /\.code-index/,
  /[/\\]runs[/\\]/,
];

export interface WatcherOptions {
  workspaceRoot: string;
  onChange: (filePath: string) => void;
  onDelete: (filePath: string) => void;
  ignoredPatterns?: RegExp[];
}

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private readonly opts: WatcherOptions;
  private readonly ignored: RegExp[];
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(opts: WatcherOptions) {
    this.opts = opts;
    this.ignored = [...DEFAULT_IGNORED, ...(opts.ignoredPatterns ?? [])];
  }

  start(): void {
    if (this.watcher) return;

    const ignoredFn = (filePath: string) =>
      this.ignored.some((re) => re.test(filePath));

    this.watcher = watch(this.opts.workspaceRoot, {
      ignoreInitial: true,
      persistent: false,
      ignored: ignoredFn,
    });

    this.watcher.on("add", (p: string) => this.schedule(p, "change"));
    this.watcher.on("change", (p: string) => this.schedule(p, "change"));
    this.watcher.on("unlink", (p: string) => this.schedule(p, "delete"));
  }

  stop(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    void this.watcher?.close();
    this.watcher = null;
  }

  private schedule(filePath: string, event: "change" | "delete"): void {
    const existing = this.pending.get(filePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.pending.delete(filePath);
      if (event === "change") {
        this.opts.onChange(filePath);
      } else {
        this.opts.onDelete(filePath);
      }
    }, 200);

    this.pending.set(filePath, timer);
  }
}
