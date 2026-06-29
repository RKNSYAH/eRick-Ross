import { GoogleGenAI } from "@google/genai";
import type { GenerationService } from "../types";

export class GeminiGenerationService implements GenerationService {
  private genAI: GoogleGenAI;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenAI({ apiKey });
  }

  async *generate(
    params: Parameters<GenerationService["generate"]>[0],
  ): AsyncGenerator<string> {
    const history = params.messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? ("model" as const) : ("user" as const),
      parts: [{ text: m.content }],
    }));

    const currentMessage = params.messages[params.messages.length - 1]?.content ?? "";

    const chat = this.genAI.chats.create({
      model: "gemini-2.5-flash-lite",
      history,
      config: {
        temperature: params.temperature ?? 0.6,
        maxOutputTokens: params.maxTokens ?? 1024,
        systemInstruction: params.systemPrompt,
      },
    });

    const result = await chat.sendMessageStream({ message: currentMessage });

    for await (const chunk of result) {
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}
