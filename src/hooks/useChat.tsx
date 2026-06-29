import { useState, useMemo, useRef, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import SYSTEM_INSTRUCTION from "../prompts/system.md?raw";
import { compressContext } from "../scripts/compressText";
import { createEmbeddingService, createGenerationService } from "../services/factory";
import type { EmbeddingService, GenerationService, AiProvider } from "../services/types";

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

type CategoryRule = {
  category: string;
  primary: RegExp;
  secondary: RegExp;
};

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Course Catalog",
    primary: /\b(comp\d{4}|isys\d{4}|mata\d{4}|gmat\d{4}|vcdd\d{4}|ghum\d{4}|course\s+code|course\s+description|what\s+is\s+[a-z]{4}\d{4}|course\s+list|course\s+catalog)\b/i,
    secondary: /\b(course|subject|class|module|elective|compulsory|offered|syllabus|outline)\b/i,
  },
  {
    category: "Campus Directory",
    primary: /\b(email|teach|teaches|contact|ukm|club|organization|phone|bursary|registry|spac|student\s+affairs|mas\s+arry|vcd\s+lab|book\s+(a\s+)?room|book\s+equipment|facility\s+booking)\b/i,
    secondary: /\b(office|department|reach|who|address|staff|admin|booking|reserve)\b/i,
  },
  {
    category: "Systems & Tools",
    primary: /\b(portal|canvas|acadis|gpa\s+calculator|lms|how\s+to\s+(login|log\s*in|access|register\s+online|use))\b/i,
    secondary: /\b(system|platform|app|website|online|software|tool|account|password|reset)\b/i,
  },
  {
    category: "Schedules & Logistics",
    primary: /\b(academic\s+calendar|class\s+schedule|midterm\s+schedule|final\s+exam\s+schedule|semester\s+dates|when\s+(is|does|do)\s+(the|my))\b/i,
    secondary: /\b(calendar|schedule|timetable|deadline|date|time|when|location|where)\b/i,
  },
  {
    category: "Academic Programs",
    primary: /\b(curriculum|graduate\s+profile|study\s+program|program\s+outcome|scientific\s+vision|degree\s+program|computer\s+science\s+program|vcd\s+program)\b/i,
    secondary: /\b(program|faculty|vision|mission|goal|objective|learning\s+outcome)\b/i,
  },
  {
    category: "Academic Planning",
    primary: /\b(prerequisite|semester\s+flow|degree\s+path|study\s+plan|krs|kartu\s+rencana|course\s+plan|plan\s+my\s+(semester|courses?|subjects?))\b/i,
    secondary: /\b(plan|planning|path|sequence|next\s+semester|which\s+(course|subject|class)|choose|pick|take\s+next|advisor|advising)\b/i,
  },
  {
    category: "Institutional Policy",
    primary: /\b(gpa\s+requirement|credit\s+load|maximum\s+credits?|code\s+of\s+conduct|academic\s+probation|graduation\s+requirement|attendance\s+policy|grading\s+(system|scale|policy)|retake\s+policy|academic\s+leave|withdrawal\s+policy)\b/i,
    secondary: /\b(gpa|credits?|policy|policies|regulation|rule|requirement|probation|graduation|allowed|permitted|maximum|minimum|limit|how\s+many|can\s+i\s+take|grade|grading|attendance|leave|drop|withdraw|retake|repeat|sanction|suspend)\b/i,
  },
];

const classifyQuestion = (input: string): string => {
  const text = input.toLowerCase();

  if (/who\s+(teaches?|is\s+teaching|is\s+the\s+(lecturer|instructor|prof|teacher)|runs?|manages?|handles?)/i.test(text)) {
    return "Campus Directory";
  }

  if (/\b(email|contact)\s+(of|for)\b/i.test(text)) {
    return "Campus Directory";
  }

  if (/what\s+is\s+[a-z]{4}\d{4}/i.test(text)) {
    return "Course Catalog";
  }

  if (/how\s+many\s+(credits?|subjects?|courses?)\s+(can|am\s+i\s+allowed)/i.test(text)) {
    return "Institutional Policy";
  }

  if (/when\s+(is|does|do|are)\s+(the|my|this)/i.test(text)) {
    return "Schedules & Logistics";
  }

  const scores: { category: string; score: number }[] = CATEGORY_RULES.map(rule => {
    let score = 0;
    const primaryMatches = text.match(rule.primary);
    if (primaryMatches) {
      score += primaryMatches.length * 3;
    }
    const secondaryMatches = text.match(rule.secondary);
    if (secondaryMatches) {
      score += secondaryMatches.length * 1;
    }
    return { category: rule.category, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const topScore = scores[0];

  if (topScore.score < 2) {
    return "Null";
  }

  return topScore.category;
};

const detectRelevantSection = (input: string): string => {
  const text = input.toLowerCase();

  if (/\b(room|facility|facilities|booking|book\s+a|equipment|camera|gear|lighting|lab\s+equipment)\b/.test(text)) {
    return "facilities";
  }

  if (/\b(teach|teaches|teaching|lecturer|instructor|professor|prof|faculty|who\s+(teaches?|is\s+the))\b/.test(text)) {
    return "faculty";
  }

  if (/\b(ukm|club|clubs|organization|organisations|student\s+org|bem|student\s+union)\b/.test(text)) {
    return "organizations";
  }

  if (/\b(counsel|counseling|counselor|mental\s+health|stress|therapy)\b/.test(text)) {
    return "support";
  }

  return "admin";
};

const extractQueryKeywords = (input: string): string[] => {
  const matches = input.match(
    /\b(gpa|credits?|semester|course|attendance|grade|grading|exam|examination|registration|advisor|advising|leave|transfer|retake|probation|withdrawal|tuition|scholarship|internship|prerequisite|syllabus|krs|study\s*plan|acadis|portal|canvas|email|contact|schedule|calendar|short\s*semester|active|inactive)\b/gi
  );
  return [...new Set((matches || []).map(k => k.toLowerCase()))];
};

type EnvConfig = {
  AI_PROVIDER?: string;
  GEMINI_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_EMBEDDING_MODEL?: string;
  OLLAMA_GENERATION_MODEL?: string;
};

export function useChat(env: EnvConfig) {
  const provider: AiProvider = (env.AI_PROVIDER as AiProvider) || "gemini";

  const embeddingService = useMemo<EmbeddingService>(
    () => createEmbeddingService({
      provider,
      geminiApiKey: env.GEMINI_API_KEY,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
      ollamaEmbeddingModel: env.OLLAMA_EMBEDDING_MODEL,
    }),
    [provider, env.GEMINI_API_KEY, env.OLLAMA_BASE_URL, env.OLLAMA_EMBEDDING_MODEL],
  );

  const generationService = useMemo<GenerationService>(
    () => createGenerationService({
      provider,
      geminiApiKey: env.GEMINI_API_KEY,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
      ollamaGenerationModel: env.OLLAMA_GENERATION_MODEL,
    }),
    [provider, env.GEMINI_API_KEY, env.OLLAMA_BASE_URL, env.OLLAMA_GENERATION_MODEL],
  );

  const supabase = useMemo(
    () => createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY),
    [env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY],
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const sendMessage = async (input: string) => {
    if (!input.trim()) return;

    setMessages((prev) => [
      ...prev,
      { role: "user", text: input },
      { role: "ai", text: "", isLoading: true },
    ]);

    const category = classifyQuestion(input);

    try {
      if (category !== "Null") {
        const embedding = await embeddingService.embed(input);

        let allChunks: Chunk[] = [];
        const keywords = extractQueryKeywords(input);

        const needsContact = /contact|email|who/i.test(input);
        if ((category === "Institutional Policy" || category === "Academic Planning") && needsContact) {
          const { data: contactData } = await supabase.rpc("match_chunks_v2", {
            query_embedding: new Array(embeddingService.dimensions).fill(0),
            match_threshold: 0,
            match_count: 2,
            filter_category: "Campus Directory",
            filter_keywords: null,
          });
          if (contactData) allChunks.push(...contactData);
        }

        const { data: contextData, error } = await supabase.rpc("match_chunks_v2", {
          query_embedding: embedding,
          match_threshold: 0,
          match_count: 15,
          filter_category: category,
          filter_keywords: category === "Campus Directory" || category === "Course Catalog" ? null : (keywords.length > 0 ? keywords : null),
        });

        if (error) {
          console.error(" Supabase Error:", error.message);
          return;
        }

        if (contextData) {
          allChunks.push(...contextData);
        }
        console.log(category)
        console.log("Chunks length: " + allChunks.length)
        console.log(allChunks)

        if (allChunks.length < 2) {
          const { data: fallbackData } = await supabase.rpc("match_chunks_v2", {
            query_embedding: embedding,
            match_threshold: 0.25,
            match_count: 15,
            filter_category: category,
            filter_keywords: null,
          });
          if (fallbackData && fallbackData.length > 0) {
            allChunks = fallbackData;
          }
        }

        allChunks = dedupeChunks(allChunks);
        allChunks = allChunks.map(c => ({
          ...c,
          content_text: cleanContextNoise(c.content_text),
        }));
        allChunks.sort((a, b) => b.similarity - a.similarity);
        allChunks = allChunks.slice(0, 15);

        let charCount = 0;
        const budgeted: Chunk[] = [];
        for (const chunk of allChunks) {
          if (charCount + chunk.content_text.length > 15000) break;
          budgeted.push(chunk);
          charCount += chunk.content_text.length;
        }
        allChunks = budgeted;

        let finalChunks = allChunks;
        if (category === "Campus Directory") {
          const section = detectRelevantSection(input);
          const inputLower = input.toLowerCase();

          const queryTerms = inputLower
            .split(/\s+/)
            .filter(t => t.length > 2)
            .filter(t => !["the", "what", "who", "how", "can", "does", "for", "and", "this", "that", "please", "send"].includes(t));

          if (section === "facilities") {
            finalChunks = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              return (
                text.includes("facility") ||
                text.includes("booking") ||
                text.includes("room") ||
                text.includes("arry") ||
                text.includes("vcd.lab") ||
                text.includes("equipment")
              );
            });
          } else if (section === "faculty") {
            finalChunks = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              const hasEmail = /@sampoernauniversity\.ac\.id/.test(text);
              const hasCourseCode = /[a-z]{4}\d{4}/.test(text);
              const hasTeachingTerms = /\b(teach|instructor|lecturer|professor|head\s+of\s+program|dean|faculty)\b/.test(text);
              const hasQueryMatch = queryTerms.some(term => text.includes(term));
              return hasEmail || hasCourseCode || hasTeachingTerms || hasQueryMatch;
            });
          } else if (section === "organizations") {
            finalChunks = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              return (
                text.includes("organization") ||
                text.includes("ukm") ||
                text.includes("bem") ||
                text.includes("student activities") ||
                text.includes("club") ||
                text.includes("religious") ||
                text.includes("sports") ||
                text.includes("arts")
              );
            });
          } else if (section === "support") {
            finalChunks = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              return (
                text.includes("counseling") ||
                text.includes("counselor") ||
                text.includes("student.counseling") ||
                text.includes("mental health")
              );
            });
          } else {
            const adminFiltered = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              return (
                text.includes("bursary") ||
                text.includes("registry") ||
                text.includes("spac") ||
                text.includes("student affairs") ||
                text.includes("student.affairs") ||
                text.includes("academic.registry") ||
                text.includes("@sampoernauniversity")
              );
            });
            finalChunks = adminFiltered.length > 0 ? adminFiltered : allChunks;
          }

          if (finalChunks.length === 0) {
            finalChunks = allChunks;
          }
        }

        console.log("Final chunks: " + finalChunks.length)

        const contextText = category === "Campus Directory"
          ? allChunks.map(c => c.content_text).join("\n\n")
          : compressContext(allChunks, category);

        const messageFormat = `[Context]\n${contextText}\n\n[Question]\n${input}`;

        console.log(messageFormat)

        const historyForLlm = messagesRef.current
          .filter(m => !m.isLoading && m.text)
          .map(m => ({ role: m.role === "ai" ? "assistant" as const : "user" as const, content: m.text }));

        historyForLlm.push({ role: "user", content: messageFormat });

        const stream = generationService.generate({
          messages: historyForLlm,
          systemPrompt: SYSTEM_INSTRUCTION,
        });

        for await (const chunk of stream) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              role: "ai",
              text: updated[lastIndex].text + chunk,
              isLoading: false,
            };
            return updated;
          });
        }
      } else {
        const messageFormat = `[Question]\n${input}\n\nRespond as eRick Ross. Since this is a general or social message, be warm and welcoming. Remind them that you are here to help with Sampoerna University related questions whenever they need it!`;

        const historyForLlm = messagesRef.current
          .filter(m => !m.isLoading && m.text)
          .map(m => ({ role: m.role === "ai" ? "assistant" as const : "user" as const, content: m.text }));

        historyForLlm.push({ role: "user", content: messageFormat });

        const stream = generationService.generate({
          messages: historyForLlm,
          systemPrompt: SYSTEM_INSTRUCTION,
        });

        for await (const chunk of stream) {
          setMessages((prev) => {
            const updated = [...prev];
            const lastIndex = updated.length - 1;
            updated[lastIndex] = {
              role: "ai",
              text: updated[lastIndex].text + chunk,
              isLoading: false,
            };
            return updated;
          });
        }
      }
    } catch (err) {
      let errorMessage = "";

      const errMsg = err instanceof Error ? err.message : String(err);
      const errName = err instanceof Error ? err.name : "";

      if (errMsg.includes("network") || errName === "TypeError" || errMsg.includes("Failed to fetch")) {
        if (provider === "ollama") {
          errorMessage = "Can't connect to the local AI server. Make sure Ollama is running on your machine!";
        } else {
          errorMessage = "Looks like there's a connection issue. Check your internet and try again!";
        }
      } else if (errMsg.includes("429") || errMsg.includes("quota")) {
        errorMessage = "I'm getting a lot of questions right now. Give me a moment and try again in a few seconds.";
      } else if (errMsg.includes("model") && errMsg.includes("not found")) {
        errorMessage = "The AI model isn't downloaded yet. Run `ollama pull llama3.1:8b` and `ollama pull nomic-embed-text` in your terminal.";
      } else {
        errorMessage = "Something went wrong on my end. Try sending that again — if it persists, a quick page refresh usually fixes it.";
      }

      console.error(" Chat error:", errMsg);

      setMessages((prev) => {
        const updated = [...prev];
        const lastIndex = updated.length - 1;
        updated[lastIndex] = {
          role: "ai",
          text: errorMessage,
          isLoading: false,
        };
        return updated;
      });
      console.error(err);
    }
  };

  return { messages, sendMessage, provider };
}
