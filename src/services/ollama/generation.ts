import type { GenerationService } from "../types";

export class OllamaGenerationService implements GenerationService {
  private baseUrl: string;
  private model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
  }

  async *generate(
    params: Parameters<GenerationService["generate"]>[0],
  ): AsyncGenerator<string> {
    const ollamaMessages: Array<{ role: string; content: string }> = [];

    if (params.systemPrompt) {
      ollamaMessages.push({ role: "system", content: params.systemPrompt });
    }
    console.log("systemPrompt:", params.systemPrompt);
    console.log("messages:", params.messages);

    for (const msg of params.messages) {
      ollamaMessages.push({ role: msg.role, content: msg.content });
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: params.temperature ?? 0.6,
          num_predict: params.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Ollama generation failed (${response.status}): ${response.statusText}. ${errText}`,
      );
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.done && parsed.message?.content) {
            yield parsed.message.content;
          } else if (parsed.message?.content) {
            yield parsed.message.content;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }
  }
}
