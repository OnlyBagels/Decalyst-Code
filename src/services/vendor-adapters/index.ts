export { ClaudeAdapter } from "./claude-adapter.js";
export { CursorAdapter } from "./cursor-adapter.js";
export { KiroAdapter } from "./kiro-adapter.js";
export { VendorAdapterAggregator, type Adapter } from "./aggregator.js";
export type {
  AdapterContent,
  AdapterDiscoverResult,
  SkillDef,
  MemoryEntry,
} from "./types.js";

import { ClaudeAdapter } from "./claude-adapter.js";
import { CursorAdapter } from "./cursor-adapter.js";
import { KiroAdapter } from "./kiro-adapter.js";
import { VendorAdapterAggregator } from "./aggregator.js";

export function createDefaultAggregator(): VendorAdapterAggregator {
  return new VendorAdapterAggregator({
    adapters: [new ClaudeAdapter(), new CursorAdapter(), new KiroAdapter()],
  });
}
