import { FunctionDeclaration, Type } from "@google/genai";

export const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';
export const READER_MODEL = 'gemini-2.5-flash';

// Tools for Insight (Live)
export const SEARCH_TOOL: FunctionDeclaration = {
  name: 'search_google',
  description: 'Search Google for real-time information, news, weather, prices, shopping, or general knowledge.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query.'
      }
    },
    required: ['query']
  }
};

export const PLAY_TOOL: FunctionDeclaration = {
  name: 'play_video',
  description: 'Play a video or music on YouTube.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The name of the song, video, or content to play.'
      }
    },
    required: ['query']
  }
};

export const SYSTEM_INSTRUCTION_INSIGHT = `You are Lumen, a "Digital Visual Cortex" for the visually impaired.
Your Default Mode is "Cognition": You see the world through the camera and hear the user.

Capabilities:
1. **Vision**: Describe the environment, people, and objects naturally.
2. **Search**: If the user asks for info you don't know (news, weather, *prices*, *shopping info*, facts), use the 'search_google' tool.
3. **Media**: If the user wants to hear music or a video, use the 'play_video' tool.

Rules:
- Be concise and conversational.
- If finding prices, mention the price clearly.
- If playing media, say "Playing [content]" and call the tool.
- Do not announce you are using a tool, just do it.`;

export const SYSTEM_INSTRUCTION_READER = `You are the "Analyst", a dedicated reading assistant.
Your goal: Read and interpret the visual content provided (documents, charts, math, signs).

Rules:
- Provide a clear, structured verbal summary.
- If it's a document, read the key parts.
- If it's a chart, explain the trend.
- Do not offer to search or play media; that is handled by the other system. Focus on the image data.`;

// Audio Config
export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;
export const VAD_THRESHOLD = 0.02;