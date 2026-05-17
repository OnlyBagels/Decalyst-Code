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

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: unknown;
}

export interface AssistantMessage {
  role: "assistant";
  content: string | null;
  tool_calls?: ToolCallRequest[];
}

export interface ToolResultMessage {
  role: "tool";
  tool_call_id: string;
  content: string;
}

export interface CompleteWithToolsArgs {
  model: string;
  messages: Array<ChatMessage | AssistantMessage | ToolResultMessage>;
  tools: ToolSpec[];
  temperature: number;
  maxTokens: number;
  agent?: string;
  toolChoice?: "auto" | "required" | "none";
}

export interface CompleteWithToolsResult {
  message: AssistantMessage;
  finishReason: "stop" | "tool_calls" | "length" | "content_filter";
}

export interface ModelClient {
  completeJson(args: ModelCallArgs): Promise<string>;
  completeText(args: ModelCallArgs): Promise<string>;
  completeWithTools(args: CompleteWithToolsArgs): Promise<CompleteWithToolsResult>;
}
