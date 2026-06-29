import { GoogleGenAI } from "@google/genai";
import type { EmbeddingService } from "../types";

export class GeminiEmbeddingService implements EmbeddingService {
  private genAI: GoogleGenAI;
  readonly dimensions = 768;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.genAI.models.embedContent({
      model: "gemini-embedding-2",
      contents: text,
      config: { outputDimensionality: this.dimensions },
    });

    const values = result.embeddings?.[0]?.values;
    if (!values) {
      throw new Error("Gemini embedding response missing values");
    }
    return values;
  }
}
