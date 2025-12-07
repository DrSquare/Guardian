import { GoogleGenAI } from '@google/genai';
import { READER_MODEL, SYSTEM_INSTRUCTION_READER } from '../constants';
import { AnalysisResult } from '../types';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * System 3: Analyst Mode (Reader)
 * Strictly analyzes the image provided.
 */
export const performAnalysis = async (
  promptText: string,
  base64Image: string
): Promise<AnalysisResult> => {
  if (!apiKey) throw new Error("API Key missing");

  try {
    const parts: any[] = [
      {
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64Image
        }
      },
      { text: promptText }
    ];

    // Analyst can still use Search grounding if necessary for context, but primary job is reading.
    const tools: any[] = [{ googleSearch: {} }];

    const config: any = {
      systemInstruction: SYSTEM_INSTRUCTION_READER,
      temperature: 0.1, // Precision is key for reading
      tools: tools
    };

    const response = await ai.models.generateContent({
      model: READER_MODEL,
      contents: { parts },
      config
    });

    const text = response.text || "No analysis generated.";
    return { text };

  } catch (error) {
    console.error("Analyst Error:", error);
    return { text: "Failed to analyze image." };
  }
};

/**
 * Helper for Insight Live Tool: Google Search
 * Uses the Flash model to perform a search and return a synthesized answer string.
 */
export const performToolSearch = async (query: string): Promise<string> => {
    if (!apiKey) return "API Key missing";
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Answer this query using Google Search. Be concise and natural for voice output. Query: ${query}`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        return response.text || "I found some results but couldn't summarize them.";
    } catch (e) {
        console.error("Search Tool Error", e);
        return "I had trouble connecting to Search.";
    }
}

export const getGeminiClient = () => ai;