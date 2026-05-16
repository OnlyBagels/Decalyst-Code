export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelClient {
  completeJson(args: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens: number;
  }): Promise<string>;

  completeText(args: {
    model: string;
    messages: ChatMessage[];
    temperature: number;
    maxTokens: number;
  }): Promise<string>;
}
