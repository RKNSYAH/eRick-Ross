import ollama from "ollama";
import type { EmbeddingService } from "../types";

export class OllamaEmbeddingService implements EmbeddingService {
  private model: string;
  readonly dimensions: number;

  constructor(_baseUrl: string, model: string, dimensions: number = 768) {
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await ollama.embeddings({
      model: this.model,
      prompt: text,
    });
    return response.embedding;
  }
}
