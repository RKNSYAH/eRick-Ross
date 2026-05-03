import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import "dotenv/config";
import { PDFParse, type TextResult } from "pdf-parse";

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
);

// split files into multiple chunks to optimize token and query time
function chunkDocuments(text: TextResult) {
const chunks = [];
const chunkSize = 3500; // max characters per chunk (context size)
const overlap = 80;  // shared characters between chunks
for (let i = 0; i < text.text.length; i += chunkSize - overlap) {
  chunks.push(text.text.slice(i, i + chunkSize));
}
return chunks;
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
// inject the text from pdfs as chunks
    const documentId = savePdf.data.id;
    const parsed = new PDFParse({ data: buffer });
    const text = await parsed.getText();
    const chunks = chunkDocuments(text);

    const rows = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      const response = await genAI.models.embedContent({
        model: "gemini-embedding-2",
        contents: [
          {
            text: chunk,
          },
        ],
        config: {
          outputDimensionality: 768,
        },
      });

      rows.push({
        document_id: documentId,
        file_name: file,
        content_text: chunk,
        chunk_index: i,
        embedding: response.embeddings?.[0].values
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

injectDocument();
