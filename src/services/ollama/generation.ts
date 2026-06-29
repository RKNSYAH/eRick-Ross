import type { GenerationService } from "../types";
import ollama from "ollama";

export class OllamaGenerationService implements GenerationService {
  private model: string;

  constructor(_baseUrl: string, model: string) {
    this.model = model;
  }

  async *generate(
    params: Parameters<GenerationService["generate"]>[0],
  ): AsyncGenerator<string> {
    const ollamaMessages: Array<{ role: string; content: string }> = [];

    if (params.systemPrompt) {
      ollamaMessages.push({ role: "system", content: params.systemPrompt });
    }

    for (const msg of params.messages) {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }

    const stream = await ollama.chat({
      model: this.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: params.temperature ?? 0.6,
        num_predict: params.maxTokens ?? 1024,
      },
    });
    console.log(ollamaMessages)

    for await (const chunk of stream) {
      if (chunk.message.content) {
        yield chunk.message.content;
      }
    }
  }
}
