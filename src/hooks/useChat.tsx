import { useState, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const SYSTEM_INSTRUCTION = import.meta.env.VITE_GEMINI_INSTRUCTION
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL!, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY!);

type Message = {
    role: 'user' | 'ai';
    text: string;
    isLoading?: boolean;
};

export function useChat() {
    const [messages, setMessages] = useState<Message[]>([]);

    const chatSession = useMemo(() => {
        return genAI.chats.create({
            model: 'gemini-3.1-flash-lite-preview',
            history: [],
            config: {
                temperature: 0.2,
                maxOutputTokens: 1024,
                systemInstruction: SYSTEM_INSTRUCTION,
            }
        })
    }, []);

    const sendMessage = async (input: string) => {
        if (!input.trim()) return;

        setMessages(prev => [...prev, { role: 'user', text: input }, { role: 'ai', text: '', isLoading: true }]);


        try {
            // 2. RAG Retrieval
            const embeddingResult = await genAI.models.embedContent({ model: "gemini-embedding-2", contents: input, config: {
                outputDimensionality: 768
            } });
            const { data: contextData, error } = await supabase.rpc('vectorsimilarity', {
                query_embedding: embeddingResult.embeddings?.[0].values,
                match_threshold: 0.5,
                match_count: 3
            });

            if (error) {
                console.error("❌ Supabase Error:", error.message);
                return "";
            }

            const contextText = contextData?.map((d: { content: string }) => d.content).join("\n") || "No context found.";

            const result = await chatSession.sendMessageStream({
                message: `Context: ${contextText}\n\nQuestion: ${input}`,
            });
            console.log(`Context: ${contextText}\n\nQuestion: ${input}`)
            for await (const chunk of result) { // Stream the response and update the last message with new content
                setMessages(prev => {
                    const updated = [...prev];
                    const lastIndex = updated.length - 1;

                    updated[lastIndex] = {
                        role: 'ai',
                        text: updated[lastIndex].text + chunk.text, // Append new text to existing text
                        isLoading: false
                    };


                    return updated;
                });
                }
            } catch (err) {
                console.error(err);
            }
        };

        return { messages, sendMessage };
    }