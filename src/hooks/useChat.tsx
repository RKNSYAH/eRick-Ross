import { useState, useMemo } from "react";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import SYSTEM_INSTRUCTION from "../prompts/system.md?raw";
import { compressContext } from "../scripts/compressText";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
console.log("SUPABASE_URL exists:", !!process.env.SUPABASE_URL);
console.log("SUPABASE_KEY exists:", !!process.env.SUPABASE_ANON_KEY);
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!
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

/**
 * Scores each category based on keyword matches.
 * Returns the highest-scoring category, or "Null" if no meaningful match.
 */
const classifyQuestion = (input: string): string => {
  const text = input.toLowerCase();

  // ════════════════════════════════════════════
  // INTENT OVERRIDES (check these first)
  // ════════════════════════════════════════════

  // If asking about WHO teaches/runs something → Campus Directory
  if (/who\s+(teaches?|is\s+teaching|is\s+the\s+(lecturer|instructor|prof|teacher)|runs?|manages?|handles?)/i.test(text)) {
    return "Campus Directory";
  }

  // If asking about a specific person's email/contact → Campus Directory
  if (/\b(email|contact)\s+(of|for)\b/i.test(text)) {
    return "Campus Directory";
  }

  // If asking "what is [COURSE_CODE]" → Course Catalog
  if (/what\s+is\s+[a-z]{4}\d{4}/i.test(text)) {
    return "Course Catalog";
  }

  // If asking "how many credits can I take" → Institutional Policy
  if (/how\s+many\s+(credits?|subjects?|courses?)\s+(can|am\s+i\s+allowed)/i.test(text)) {
    return "Institutional Policy";
  }

  // If asking "when is" something → Schedules & Logistics
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

  // Facilities/rooms/equipment
  if (/\b(room|facility|facilities|booking|book\s+a|equipment|camera|gear|lighting|lab\s+equipment)\b/.test(text)) {
    return "facilities";
  }

  // Faculty/teaching staff
  if (/\b(teach|teaches|teaching|lecturer|instructor|professor|prof|faculty|who\s+(teaches?|is\s+the))\b/.test(text)) {
    return "faculty";
  }

  // Student organizations
  if (/\b(ukm|club|clubs|organization|organisations|student\s+org|bem|student\s+union)\b/.test(text)) {
    return "organizations";
  }

  // Counseling/support
  if (/\b(counsel|counseling|counselor|mental\s+health|stress|therapy)\b/.test(text)) {
    return "support";
  }

  // Default: administrative contacts
  return "admin";
};

const extractQueryKeywords = (input: string): string[] => {
  const matches = input.match(
    /\b(gpa|credits?|semester|course|attendance|grade|grading|exam|examination|registration|advisor|advising|leave|transfer|retake|probation|withdrawal|tuition|scholarship|internship|prerequisite|syllabus|krs|study\s*plan|acadis|portal|canvas|email|contact|schedule|calendar|short\s*semester|active|inactive)\b/gi
  );
  return [...new Set((matches || []).map(k => k.toLowerCase()))];
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

    try {
      if (category !== "Null") {
        // RAG Retrieval
        const embeddingResult = await genAI.models.embedContent({
          model: "gemini-embedding-2",
          contents: input,
          config: { outputDimensionality: 768 },
        });

        let allChunks: Chunk[] = [];
        const keywords = extractQueryKeywords(input); // ["gpa", "credits", "semester"]

        // Optional: pull contact info for policy questions
        const needsContact = /contact|email|who/i.test(input);
        if ((category === "Institutional Policy" || category === "Academic Planning") && needsContact) {
          const { data: contactData } = await supabase.rpc("match_chunks_v2", {
            query_embedding: new Array(768).fill(0),
            match_threshold: 0,
            match_count: 2,
            filter_category: "Campus Directory",
            filter_keywords: null,
          });
          if (contactData) allChunks.push(...contactData);
        }

        // In sendMessage, adjust the RPC call based on category
        const { data: contextData, error } = await supabase.rpc("match_chunks_v2", {
          query_embedding: embeddingResult.embeddings?.[0].values,
          match_threshold: 0.3,
          match_count: 15,
          filter_category: category,
          // Don't use keyword filtering for directory — rely on semantic search
          filter_keywords: category === "Campus Directory" ? null : (keywords.length > 0 ? keywords : null),
        });

        if (error) {
          console.error("❌ Supabase Error:", error.message);
          return;
        }

        if (contextData) {
          allChunks.push(...contextData);
        }

        if (allChunks.length < 2) {
          const { data: fallbackData } = await supabase.rpc("match_chunks_v2", {
            query_embedding: embeddingResult.embeddings?.[0].values,
            match_threshold: 0.25,  // Lower threshold for fallback
            match_count: 15,
            filter_category: category,
            filter_keywords: null,  // No keyword filter
          });
          if (fallbackData && fallbackData.length > 0) {
            allChunks = fallbackData;  // Replace, don't append
          }
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
          if (charCount + chunk.content_text.length > 15000) break;
          budgeted.push(chunk);
          charCount += chunk.content_text.length;
        }
        allChunks = budgeted;

        // Category-specific filtering for directory
        let finalChunks = allChunks;
        if (category === "Campus Directory") {
          const section = detectRelevantSection(input);
          const inputLower = input.toLowerCase();

          // Extract specific terms from the query to match against chunks
          // e.g., "OOP" → look for "oop" or "object oriented" in chunks
          // e.g., "bursary email" → look for "bursary" in chunks
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
            // For faculty questions, DON'T aggressively filter
            // The semantic search should already have found the right chunks
            // Just remove obviously irrelevant admin-only chunks
            finalChunks = allChunks.filter((chunk) => {
              const text = chunk.content_text.toLowerCase();
              // Keep chunks that have: email addresses, course codes, instructor names, or query terms
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
            // Admin section — only filter if we have enough chunks
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
            // Only apply filter if it doesn't eliminate everything
            finalChunks = adminFiltered.length > 0 ? adminFiltered : allChunks;
          }

          // Safety: if filtering removed everything, fall back to unfiltered
          if (finalChunks.length === 0) {
            finalChunks = allChunks;
          }
        }


        // Build context
        const contextText = category === "Campus Directory"
          ? finalChunks.map(c => c.content_text).join("\n\n")
          : compressContext(finalChunks, category);

        const messageFormat = `[Context]\n${contextText}\n\n[Question]\n${input}`;


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