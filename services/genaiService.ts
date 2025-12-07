import { GoogleGenAI, Type } from '@google/genai';
import { READER_MODEL, SYSTEM_INSTRUCTION_READER } from '../constants';

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * System 3: Reader Mode
 * Takes a base64 image and returns structured analysis.
 * @param base64Image The image data
 * @param customPrompt Optional specific question from user
 */
export const analyzeImage = async (base64Image: string, customPrompt?: string): Promise<string> => {
  if (!apiKey) throw new Error("API Key missing");

  const promptText = customPrompt || "Analyze this visual data. If text, read it. If chart, explain it. If math, solve/explain it.";

  try {
    const response = await ai.models.generateContent({
      model: READER_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: promptText
          }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION_READER,
        temperature: 0.2 // Low temp for factual accuracy
      }
    });

    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Reader Error:", error);
    return "Failed to analyze image. Please try again.";
  }
};

export const getGeminiClient = () => ai;