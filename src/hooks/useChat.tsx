import { useState, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import SYSTEM_INSTRUCTION from "../prompts/system.md?raw";
import { compressContext } from "../scripts/compressText";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
);

type Message = {
  role: "user" | "ai";
  text: string;
  isLoading?: boolean;
};

type Chunk = {
  content_text: string;
  similarity: number;
};

const cleanContextNoise = (text: string): string => {
  return text
    .replace(/[k]\s[o]\s[o]\s[b]\s[d]\s[n]\s[a]\s[H]\s[t]\s[n]\s[e]\s[d]\s[u]\s[t]\s[S]/gi, '')
    .replace(/Sampoerna University\s*\|\s*/gi, '')
    .replace(/NO\s+COURSE\s+OWNER\s+SU\s+CODES\s+COURSE\s+TITLE\s+CREDITS\s+COURSE\s+GROUPING\s+YEAR\s+SEMESTER\s+OFFERED/gi, '')
    .replace(/--\s\d+\sof\s\d+\s--/g, '')
    .replace(/\s\s+/g, ' ')
    .trim();
};

const dedupeChunks = (chunks: Chunk[]): Chunk[] => {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    const key = c.content_text.slice(0, 200);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const classifyQuestion = (input: string): string => {
  const text = input.toLowerCase();

  const rules: [string, RegExp][] = [
    ["Course Catalog", /\b(course|comp\d{4}|isys\d{4}|mata\d{4}|credits?\s+\d|course\s+code|what\s+is\s+[a-z]{4}\d{4})\b/i],
    ["Campus Directory", /\b(email|emails|contacts|contact|phone|office|department|who\s+(is|do\s+i)|bursary|registry|spac)\b/i],
    ["Systems & Tools", /\b(portal|canvas|gpa\s+calculator|how\s+do\s+i\s+(use|access|log\s*in)|lms|system)\b/i],
    ["Schedules & Logistics", /\b(schedule|midterm|final\s+exam|when\s+is|class\s+time|location|room\s+\d)\b/i],
    ["Academic Programs", /\b(curriculum|graduate\s+profile|study\s+program|vision|mission|program\s+outcome)\b/i],
    ["Academic Planning", /\b(prerequisite|semester\s+flow|degree\s+path|major|minor|concentration|study\s+plan)\b/i],
    ["Institutional Policy", /\b(gpa|policy|regulation|rule|requirement|code\s+of\s+conduct|probation|graduation|credit\s+load|maximum\s+credits?)\b/i],
  ];

  for (const [category, regex] of rules) {
    if (regex.test(text)) return category;
  }

  return "Null";
};

const detectRelevantSection = (input: string) => {
  const text = input.toLowerCase();
  if (text.includes("room") || text.includes("facility") || text.includes("booking")) {
    return "facilities";
  }
  if (text.includes("lecturer") || text.includes("professor") || text.includes("course")) {
    return "faculty";
  }
  return "admin";
};

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);

  const chatSession = useMemo(() => {
    return genAI.chats.create({
      model: "gemini-2.5-flash-lite",
      history: [],
      config: {
        temperature: 0.6,
        maxOutputTokens: 1024,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
  }, []);

  const sendMessage = async (input: string) => {
    if (!input.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: input },
      { role: "ai", text: "", isLoading: true },
    ]);

    // Free keyword-based classification (no LLM call)
    const category = classifyQuestion(input);
    console.log("Detected Category:", category);

    try {
      if (category !== "Null") {
        // RAG Retrieval
        const embeddingResult = await genAI.models.embedContent({
          model: "gemini-embedding-2",
          contents: input,
          config: { outputDimensionality: 768 },
        });

        let allChunks: Chunk[] = [];

        // Optional: pull contact info for policy questions
        const needsContact = /contact|email|who/i.test(input);
        if ((category === "Institutional Policy" || category === "Academic Planning") && needsContact) {
          const { data: contactData } = await supabase.rpc("match_chunks_globally", {
            query_embedding: new Array(768).fill(0),
            match_threshold: 0,
            match_count: 2,
            doc_match_count: 1,
            filter_category: "Campus Directory",
            query_text: "SPAC Academic Registry contact email",
          });
          if (contactData) allChunks.push(...contactData);
        }

        const { data: contextData, error } = await supabase.rpc("match_chunks_globally", {
          query_embedding: embeddingResult.embeddings?.[0].values,
          match_threshold: 0.45,
          match_count: 10,
          doc_match_count: 2,
          filter_category: category,
          query_text: input,
        });

        if (error) {
          console.error("❌ Supabase Error:", error.message);
          return;
        }

        if (contextData) {
          allChunks.push(...contextData);
        }

        // Pipeline: dedupe → clean → sort → cap → budget
        allChunks = dedupeChunks(allChunks);
        allChunks = allChunks.map(c => ({
          ...c,
          content_text: cleanContextNoise(c.content_text),
        }));
        allChunks.sort((a, b) => b.similarity - a.similarity);
        allChunks = allChunks.slice(0, 15);

        // Token budget enforcement
        let charCount = 0;
        const budgeted: Chunk[] = [];
        for (const chunk of allChunks) {
          if (charCount + chunk.content_text.length > 22000) break;
          budgeted.push(chunk);
          charCount += chunk.content_text.length;
        }
        allChunks = budgeted;

        // Category-specific filtering for directory
        let finalChunks = allChunks;
        if (category === "Campus Directory") {
          const section = detectRelevantSection(input);
          finalChunks = allChunks.filter((chunk) => {
            const text = chunk.content_text.toLowerCase();
            if (section === "facilities") {
              return text.includes("facility") || text.includes("booking") || text.includes("room") || text.includes("arry");
            }
            if (section === "faculty") {
              return text.includes("course") || text.includes("lecturer");
            }
            return text.includes("bursary") || text.includes("registry") || text.includes("spac") || text.includes("student affairs");
          });
        }

        // Build context
        const contextText = category === "Campus Directory"
          ? finalChunks.map(c => c.content_text).join("\n\n")
          : compressContext(finalChunks, category);

        const messageFormat = `[Context]\n${contextText}\n\n[Question]\n${input}`;

        console.log("Context length:", contextText.length, "chars");
        console.log(messageFormat);

        const result = await chatSession.sendMessageStream({ message: messageFormat });

        let totalTokenUsed;
        for await (const chunk of result) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              role: "ai",
              text: updated[lastIndex].text + chunk.text,
              isLoading: false,
            };
            return updated;
          });
          totalTokenUsed = chunk.usageMetadata;
        }
        console.log("Total tokens used:", totalTokenUsed);
      } else {
        const messageFormat = `[Question]\n${input}\n\nRespond as eRick Ross. Since this is a general or social message, be warm and welcoming. Remind them that you are here to help with Sampoerna University related questions whenever they need it!`;

        const result = await chatSession.sendMessageStream({ message: messageFormat });

        for await (const chunk of result) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              role: "ai",
              text: updated[lastIndex].text + chunk.text,
              isLoading: false,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return { messages, sendMessage };
}