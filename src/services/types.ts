export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  readonly dimensions: number;
}

export interface GenerationService {
  generate(params: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    systemPrompt: string;
    temperature?: number;
    maxTokens?: number;
  }): AsyncGenerator<string>;
}

export type AiProvider = "gemini" | "ollama";
