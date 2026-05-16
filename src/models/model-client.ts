export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelCallArgs {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Label used for usage-tracking attribution (e.g. "planner", "swarm:src/server.ts"). */
  agent?: string;
}

export interface ModelClient {
  completeJson(args: ModelCallArgs): Promise<string>;
  completeText(args: ModelCallArgs): Promise<string>;
}
