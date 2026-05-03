import { GoogleGenAI } from "@google/genai";
import fs from 'fs'
import { createClient } from "@supabase/supabase-js";
import path from 'path';
import 'dotenv/config'

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!);

async function injectDocument() {
    const folderPath = "./files"
    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.pdf'));

    for (const file of files) {
        const data = fs.readFileSync(path.join(folderPath, file), { encoding: "base64" })
        const response = await genAI.models.embedContent({
            model: "gemini-embedding-2",
            contents: [{
                inlineData: {
                    mimeType: 'application/pdf',
                    data: data,
                },
            }],
            config: {
                outputDimensionality: 768
            }

        })
        // console.log(response.embeddings[0].values)
        const result = await supabase.from("sudocumentvector").insert({ file_name: file, embedding: response.embeddings[0].values })
        if (result.error) console.error(`Error ${file}:`, result);
        else console.log(`✅ Stored ${file}`);
    }

}

injectDocument()
