import type { EmbeddingService } from "../types";

export class OllamaEmbeddingService implements EmbeddingService {
  private baseUrl: string;
  private model: string;
  readonly dimensions: number;

  constructor(baseUrl: string, model: string, dimensions: number = 768) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.model, prompt: text }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `Ollama embedding failed (${response.status}): ${response.statusText}. ${errText}`,
      );
    }

    const data = await response.json();
    if (!data.embedding) {
      throw new Error("Ollama embedding response missing 'embedding' field");
    }
    return data.embedding;
  }
}
