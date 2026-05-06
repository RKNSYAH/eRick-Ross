import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import "dotenv/config";
import { PDFParse } from "pdf-parse";

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
);

const FILE_CATEGORY_MAP: Record<string, string> = {
  "Course Description All SU Courses_202410.pdf": "Course Catalog",
  "CS Curriculum 2024 signed.pdf": "Academic Programs",
  "SU_Handbook_2025.pdf": "Institutional Policy",
  "CS Degree Plan 24-25 (2) (1).pdf": "Academic Planning",
  "Lecture_Academic_Portal_Manual.pdf": "Systems & Tools",
  "Student_Academic_Portal_Manual.pdf": "Systems & Tools",
  "[SU] WEB_Academic Calendar design, AY 2025-26 [Bachelor].pdf": "Schedules & Logistics",
  "CONTACTS General Sampoerna University.pdf": "Campus Directory",
  "Sampoerna University Course List - AY 24-25.pdf": "Course Catalog",
  "Sampoerna University Class Schedule - Undergraduate - Spring 2026 (1).pdf": "Schedules & Logistics",
  "User_Manual-GPA_Calculator.pdf": "Systems & Tools",
  "Degree Plan Flowchart - CS 24-25.pdf": "Academic Planning",
  "[SU] Academic Calendar design, AY 2026-27 [under_web].pdf": "Schedules & Logistics",
};

type SmartChunk = {
  content_text: string;
  section_title: string;
  category: string;
  chunk_index: number;
  topic_keywords: string[];

};

function cleanPdfText(text: string): string {
  return text
    .replace(/[k]\s[o]\s[o]\s[b]\s[d]\s[n]\s[a]\s[H]\s[t]\s[n]\s[e]\s[d]\s[u]\s[t]\s[S]/gi, '')
    .replace(/Sampoerna University\s*\|\s*/gi, '')
    .replace(/--\s\d+\sof\s\d+\s--/g, '')
    // Remove two-column page headers: "2524 Sampoerna University" or "Sampoerna University   |  koobdnaH tnedutS"
    .replace(/^\d{2,4}\s*Sampoerna University.*$/gm, '')
    // Remove paired page numbers like "7 6", "19 18", "2524", "3736" at start of lines
    .replace(/^\s*\d{1,3}\s*\d{1,3}\s*$/gm, '')
    // Remove standalone page numbers
    .replace(/^\s*\d{1,3}\s*$/gm, '')
    // Remove "Chapter X" standalone lines (we'll handle them in the header detection)
    // Keep them for now - they help identify sections
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type ChunkStrategy = "handbook" | "curriculum" | "course-list" | "table" | "calendar" | "generic";
const FILE_STRATEGY_MAP: Record<string, ChunkStrategy> = {
  "SU_Handbook_2025.pdf": "handbook",
  "CS Curriculum 2024 signed.pdf": "curriculum",
  "Sampoerna University Course List - AY 24-25.pdf": "course-list",
  "Sampoerna University Class Schedule - Undergraduate - Spring 2026 (1).pdf": "table",
  "Course Description All SU Courses_202410.pdf": "course-list",
  "CONTACTS General Sampoerna University.pdf": "generic",
  "CS Degree Plan 24-25 (2) (1).pdf": "generic",
  "Lecture_Academic_Portal_Manual.pdf": "generic",
  "Student_Academic_Portal_Manual.pdf": "generic",
  "[SU] WEB_Academic Calendar design, AY 2025-26 [Bachelor].pdf": "calendar",
  "User_Manual-GPA_Calculator.pdf": "generic",
  "Degree Plan Flowchart - CS 24-25.pdf": "generic",
  "[SU] Academic Calendar design, AY 2026-27 [under_web].pdf": "calendar",
};

function splitByParagraphs(text: string, maxChars: number = 800): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > maxChars && current.length > 100) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}


function chunkHandbook(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];

  const tocEnd = text.search(/Chapter\s+1|INTRODUCTION\s+TO\s+THE\s+UNIVERSITY/i);
  const contentText = tocEnd > 0 ? text.slice(tocEnd) : text;

  // Pattern 1: "Chapter X\n TITLE" (chapter-level splits)
  // Pattern 2: ALL-CAPS lines that are actual section headers (not part of TOC)
  const chapterRegex = /^Chapter\s+\d+\s*\n/gm;
  const sectionRegex = /^([A-Z][A-Z\s,&()/-]{8,})$/gm;

  // Collect all split points (chapters and sections)
  const splitPoints: { title: string; start: number; isChapter: boolean }[] = [];

  let match;

  // Find chapter markers
  while ((match = chapterRegex.exec(contentText)) !== null) {
    // Look ahead for the chapter title (next non-empty line)
    const afterMatch = contentText.slice(match.index + match[0].length, match.index + match[0].length + 200);
    const titleLines = afterMatch.split('\n').filter(l => l.trim().length > 0).slice(0, 2);
    const chapterTitle = titleLines.join(' ').trim();

    splitPoints.push({
      title: chapterTitle,
      start: match.index,
      isChapter: true,
    });
  }

  // Find section headers (ALL-CAPS lines within content)
  sectionRegex.lastIndex = 0;
  while ((match = sectionRegex.exec(contentText)) !== null) {
    const title = match[1].trim();

    // Skip noise: too short, just numbers, or known false positives
    if (title.length < 10) continue;
    if (/^\d+\s*\d*$/.test(title)) continue;
    if (/^TOTAL/.test(title)) continue;
    if (/^SEMESTER/.test(title)) continue;
    if (/^CHAPTER/.test(title)) continue; // Skip "CHAPTER X:" text in TOC
    if (/^TABLE OF CONTENTS/.test(title)) continue;

    const nearChapter = splitPoints.some(
      sp => sp.isChapter && Math.abs(sp.start - match!.index) < 100
    );
    if (nearChapter) continue;

    splitPoints.push({
      title,
      start: match.index,
      isChapter: false,
    });
  }

  // Sort by position
  splitPoints.sort((a, b) => a.start - b.start);

  if (splitPoints.length < 3) {
    return chunkGeneric(contentText, category);
  }

  // Build chunks from split points
  for (let i = 0; i < splitPoints.length; i++) {
    const start = splitPoints[i].start;
    const end = i + 1 < splitPoints.length ? splitPoints[i + 1].start : contentText.length;
    const sectionText = contentText.slice(start, end).trim();
    const sectionTitle = splitPoints[i].title;

    if (sectionText.length < 50) continue;

    const subChunks = splitByParagraphs(sectionText, 600);

    for (const sub of subChunks) {
      if (sub.length < 30) continue;

      // Clean remaining page number artifacts from chunk content
      const cleanedSub = sub
        .replace(/^\d{1,3}\s+\d{1,3}\s+/gm, '') // "25 24" at start of lines
        .replace(/^\d{2,4}\s+Sampoerna University.*$/gm, '')
        .trim();

      if (cleanedSub.length < 30) continue;

      chunks.push({
        content_text: cleanedSub,
        section_title: sectionTitle.slice(0, 80), 
        category,
        chunk_index: chunks.length,
        topic_keywords: extractKeywords(cleanedSub),
      });
    }
  }

  return chunks;
}

function chunkCurriculum(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];

  // Match patterns like:
  // "1. Curriculum Foundation"
  // "2.1. Vision"
  // "4. Graduate Profile (GP) & Program Learning Outcomes (PLOs)"
  // "Table 1. Graduate Profile..."
  const headerRegex = /^(?:Table\s+)?\d+(?:\.\d+)*\.?\s+[A-Z][^\n]{3,}$/gm;

  const sections: { title: string; start: number }[] = [];
  let match;

  while ((match = headerRegex.exec(text)) !== null) {
    sections.push({ title: match[0].trim(), start: match.index });
  }

  if (sections.length < 3) {
    return chunkGeneric(text, category);
  }

  for (let i = 0; i < sections.length; i++) {
    const start = sections[i].start;
    const end = i + 1 < sections.length ? sections[i + 1].start : text.length;
    const sectionText = text.slice(start, end).trim();
    const sectionTitle = sections[i].title;

    // For tables/large sections, use slightly bigger chunks
    const subChunks = splitByParagraphs(sectionText, 1000);

    for (const sub of subChunks) {
      if (sub.length < 30) continue;

      chunks.push({
        content_text: sub,
        section_title: sectionTitle,
        category,
        chunk_index: chunks.length,
        topic_keywords: extractKeywords(sub),
      });
    }
  }

  return chunks;
}

function chunkCourseList(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];

  // Course list pattern: lines containing course codes like COMP1401, ACCT2301, etc.
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);

  // Group courses by owner/department
  let currentOwner = "General";
  let currentBatch: string[] = [];

  const flushBatch = () => {
    if (currentBatch.length === 0) return;

    // Group every 5-8 courses into one chunk (keeps context but stays small)
    const batchSize = 6;
    for (let i = 0; i < currentBatch.length; i += batchSize) {
      const group = currentBatch.slice(i, i + batchSize);
      const content = group.join("\n");

      chunks.push({
        content_text: `Department: ${currentOwner}\n${content}`,
        section_title: `Course List - ${currentOwner}`,
        category,
        chunk_index: chunks.length,
        topic_keywords: extractKeywords(content),
      });
    }
    currentBatch = [];
  };

  for (const line of lines) {
    // Detect course code pattern (4 letters + 4 digits)
    const courseMatch = line.match(/[A-Z]{4}\d{4}/);

    if (courseMatch) {
      // Try to detect owner change (e.g., "CS", "ACCT", "MGMT")
      const ownerMatch = line.match(
        /^\d+\s+(CS|ACCT|MGMT|ELE|ME|IE|IS|VCD|FET|PSYC|General\s*Education|EAP\s*Program)\s/i
      ); if (ownerMatch) {
        const newOwner = ownerMatch[1].trim();
        if (newOwner !== currentOwner) {
          flushBatch();
          currentOwner = newOwner;
        }
      }
      currentBatch.push(line);
    }
  }

  flushBatch();

  if (chunks.length === 0) {
    return chunkGeneric(text, category);
  }

  return chunks;

}

function chunkTable(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];
  const lines = text.split("\n").filter((l) => l.trim().length > 0)

  const batchSize = 12;

  for (let i = 0; i < lines.length; i += batchSize) {
    const group = lines.slice(i, i + batchSize);
    const content = group.join("\n");

    if (content.length < 30) continue;

    chunks.push({
      content_text: content,
      section_title: "Schedule/Calendar",
      category,
      chunk_index: chunks.length,
      topic_keywords: extractKeywords(content),
    });
  }
  return chunks
}

// generic all paragraph chunks
function chunkGeneric(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];
  const subChunks = splitByParagraphs(text, 800);

  for (const sub of subChunks) {
    if (sub.length < 30) continue;

    chunks.push({
      content_text: sub,
      section_title: "General",
      category,
      chunk_index: chunks.length,
      topic_keywords: extractKeywords(sub),
    });
  }

  return chunks;
}

function chunkCalendar(text: string, category: string): SmartChunk[] {
  const chunks: SmartChunk[] = [];

  // Step 1: Aggressively clean calendar grid noise
  const cleaned = text
    // Remove day-of-week headers
    .replace(/Mon\s+Tue\s+Wed\s+Thu\s+Fri\s+Sat\s+Sun/gi, '')
    // Remove month headers that are just standalone names (the visual calendar titles)
    .replace(/^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s*$/gm, '')
    // Remove lines that are just calendar grid numbers (sequences of 1-31 separated by spaces/newlines)
    // These appear as rows like "7 14 21 28" or "1 8 15 22 29" or "2 9 16 23 30"
    .replace(/^(\d{1,2}\s+){2,}\d{1,2}\s*$/gm, '')
    // Remove standalone single/double digit numbers (leftover grid cells)
    .replace(/^\s*\d{1,2}\s*$/gm, '')
    // Remove the "2025" or "2026" standalone year labels from the visual calendar
    .replace(/^\s*20\d{2}\s*$/gm, '')
    // Remove version markers like "v2025.04.23"
    .replace(/v\d{4}\.\d{2}\.\d{2}/g, '')
    // Remove the repeated "ACADEMIC CALENDAR" title and program label
    .replace(/ACADEMIC CALENDAR\s*/gi, '')
    .replace(/Undergraduate Program\s*/gi, '')
    .replace(/\|\s*\d{4}\s*-\s*\d{4}\s*/g, '')
    // Remove legend items that appear at the bottom
    .replace(/^Holiday\s*$/gm, '')
    .replace(/^Examination Periods\s*$/gm, '')
    .replace(/^Regular Semester\s*$/gm, '')
    .replace(/^Short Semester\s*$/gm, '')
    .replace(/^Advisory \/ Registration\s*$/gm, '')
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  // Step 2: Split by semester sections
  const semesterRegex = /((?:Odd|Even|Short\s*\(?Summer\)?)\s*Semester[^\n]*|Academic\s*Year\s*\d{4}\/\d{4}[^\n]*)/gi;

  const sections: { title: string; start: number }[] = [];
  let match;

  while ((match = semesterRegex.exec(cleaned)) !== null) {
    sections.push({ title: match[1].trim(), start: match.index });
  }

  if (sections.length >= 2) {
    for (let i = 0; i < sections.length; i++) {
      const start = sections[i].start;
      const end = i + 1 < sections.length ? sections[i + 1].start : cleaned.length;
      const sectionText = cleaned.slice(start, end).trim();
      const sectionTitle = sections[i].title;

      // Extract only lines that contain meaningful event-date information
      const meaningfulLines = sectionText
        .split('\n')
        .map(l => l.trim())
        .filter(l => {
          if (l.length < 5) return false;
          // Keep the section title itself
          if (l === sectionTitle) return true;
          // Keep lines with dates (day month year patterns)
          if (/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(l)) return true;
          // Keep lines with date ranges like "11 - 15 Aug 2025" or "18 - 22 Aug 2025"
          if (/\d{1,2}\s*[-–]\s*\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(l)) return true;
          // Keep lines with full month names and year
          if (/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.test(l)) return true;
          // Keep lines with full date format like "15 July 2025" or "25 August 2025"
          if (/\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i.test(l)) return true;
          // Keep event description lines (they contain academic keywords)
          if (/\b(tuition|payment|registration|advisory|orientation|first\s*day|add.?drop|deadline|assessment|grade|submission|break|summer|bridge|graduation|semester|stadium|mid.?term|mid.?semester|final|idul\s*fitri|classes|capstone|new\s*students?)\b/i.test(l)) return true;
          return false;
        });

      if (meaningfulLines.length < 2) continue;

      const content = meaningfulLines.join('\n');

      chunks.push({
        content_text: content,
        section_title: sectionTitle,
        category,
        chunk_index: chunks.length,
        topic_keywords: extractCalendarKeywords(content),
      });
    }
  }

  // Step 3: If semester splitting didn't work, try a simpler approach
  if (chunks.length < 2) {
    // Just extract all event-date lines from the whole document
    const allEventLines = cleaned
      .split('\n')
      .map(l => l.trim())
      .filter(l => {
        if (l.length < 5) return false;
        // Has a date
        if (/\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(l)) return true;
        if (/\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)/i.test(l)) return true;
        // Has academic event keywords
        if (/\b(tuition|registration|orientation|deadline|assessment|grade|break|semester|graduation|add.?drop|advisory)\b/i.test(l)) return true;
        // Is a semester header
        if (/\b(odd|even|short|summer|fall|spring)\s*semester/i.test(l)) return true;
        return false;
      });

    // Group into chunks of ~15 lines
    const batchSize = 15;
    for (let i = 0; i < allEventLines.length; i += batchSize) {
      const group = allEventLines.slice(i, i + batchSize);
      const content = group.join('\n');

      if (content.length < 30) continue;

      chunks.push({
        content_text: content,
        section_title: "Academic Calendar",
        category,
        chunk_index: chunks.length,
        topic_keywords: extractCalendarKeywords(content),
      });
    }
  }

  // Final fallback
  if (chunks.length === 0) {
    return chunkGeneric(text, category);
  }

  return chunks;
}

function extractCalendarKeywords(text: string): string[] {
  const matches = text.match(
    /\b(tuition|payment|fee|registration|advisory|orientation|first\s*day|add.?drop|deadline|mid.?semester|mid.?term|final|assessment|grade|grades|submission|break|summer|bridge|graduation|semester|fall|spring|short|holiday|idul\s*fitri|classes|new\s*students?|capstone|stadium\s*generale)\b/gi
  );
  return [...new Set((matches || []).map(k => k.toLowerCase()))];
}

// split document into multiple chunks to optimize token and query time
function smartChunk(text: string, fileName: string): SmartChunk[] {
  const category = FILE_CATEGORY_MAP[fileName] || "General";
  const strategy = FILE_STRATEGY_MAP[fileName] || "generic";

  console.log(`  📋 Strategy: ${strategy} | Category: ${category}`);

  switch (strategy) {
    case "handbook":
      return chunkHandbook(text, category);
    case "curriculum":
      return chunkCurriculum(text, category);
    case "course-list":
      return chunkCourseList(text, category);
    case "table":
      return chunkTable(text, category);
    case "calendar":
      return chunkCalendar(text, category);
    case "generic":
    default:
      return chunkGeneric(text, category);
  }
}

function extractKeywords(text: string): string[] {
  const important = text.match(
    /\b(GPA|credits?|semester|course|attendance|grade|grading|exam|examination|registration|advisor|advising|leave|transfer|retake|probation|withdrawal|tuition|scholarship|internship|prerequisite|syllabus|KRS|study\s*plan|ACADIS|portal|canvas|email|contact|schedule|calendar|short\s*semester|active|inactive|bursary|registry|spac|student\s+affairs|facility|booking|room|lecturer|instructor|professor)\b/gi
  );
  return [...new Set((important || []).map(k => k.toLowerCase()))];
}

async function injectDocument() {
  const folderPath = "./files";
  const files = fs
    .readdirSync(folderPath)
    .filter((file) => file.endsWith(".pdf"));


  // inject whole pdf
  for (const file of files) {
    const buffer = fs.readFileSync(path.join(folderPath, file));
    const pdfBase64 = buffer.toString("base64");

    const pdfEmbed = await genAI.models.embedContent({
      model: "gemini-embedding-2",
      contents: [{
        inlineData: {
          mimeType: "application/pdf",
          data: pdfBase64,
        },
      }],
      config: { outputDimensionality: 768 }
    });

    const pdfEmbedding = pdfEmbed.embeddings?.[0].values;

    const savePdf = await supabase.from("sudocuments").insert({
      file_name: file,
      pdf_embedding: pdfEmbedding
    }).select().single()

    if (savePdf.error) {
      console.error(`❌ Document insert failed:`, savePdf.error);
      continue;
    }

    const documentId = savePdf.data.id;

    // inject the text from pdfs as chunks
    const parsed = new PDFParse({ data: buffer });
    const text = await parsed.getText();
    const cleanedText = cleanPdfText(text.text)

    const chunks = smartChunk(cleanedText, file);

    const rows = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const response = await genAI.models.embedContent({
        model: "gemini-embedding-2",
        contents: [
          {
            text: chunk.content_text,
          },
        ],
        config: {
          outputDimensionality: 768,
        },
      });

      rows.push({
        document_id: documentId,
        file_name: file,
        content_text: chunk.content_text,
        section_title: chunk.section_title,
        category: chunk.category,
        chunk_index: i,
        topic_keywords: chunk.topic_keywords,
        embedding: response.embeddings?.[0].values,
      });
      console.log(`  ↳ chunk ${i} embedded`);

    }
    const result = await supabase
      .from("sudocumentvector")
      .insert(rows);
    if (result.error) console.error(`❌ Chunk insert failed:`, result.error);
    else console.log(`✅ Stored ${file}`);
  }
}

injectDocument()