import type { EmbeddingService, GenerationService, AiProvider } from "./types";
import { OllamaEmbeddingService } from "./ollama/embedding";
import { OllamaGenerationService } from "./ollama/generation";
import { GeminiEmbeddingService } from "./gemini/embedding";
import { GeminiGenerationService } from "./gemini/generation";

export type ServiceConfig = {
  provider: AiProvider;
  geminiApiKey?: string;
  ollamaBaseUrl?: string;
  ollamaEmbeddingModel?: string;
  ollamaGenerationModel?: string;
};

export function createEmbeddingService(config: ServiceConfig): EmbeddingService {
  switch (config.provider) {
    case "ollama":
      return new OllamaEmbeddingService(
        config.ollamaBaseUrl ?? "http://localhost:11434",
        config.ollamaEmbeddingModel ?? "nomic-embed-text",
      );
    case "gemini":
    default:
      return new GeminiEmbeddingService(config.geminiApiKey ?? "");
  }
}

export function createGenerationService(config: ServiceConfig): GenerationService {
  switch (config.provider) {
    case "ollama":
      return new OllamaGenerationService(
        config.ollamaBaseUrl ?? "http://localhost:11434",
        config.ollamaGenerationModel ?? "llama3.1:8b",
      );
    case "gemini":
    default:
      return new GeminiGenerationService(config.geminiApiKey ?? "");
  }
}
