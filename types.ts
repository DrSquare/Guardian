export enum AppMode {
  INSIGHT = 'INSIGHT',   // Default: Conversational + Tools (Search/Play)
  ANALYST = 'ANALYST'    // System 3: Vision to Audio Reading
}

export interface Hazard {
  x: number;
  y: number;
  width: number;
  height: number;
  severity: 'low' | 'high';
}

export interface GroundingChunk {
  web?: { uri: string; title: string };
  maps?: { 
      uri: string; 
      title: string; 
  };
}

export interface AnalysisResult {
  text: string;
  groundingChunks?: GroundingChunk[];
}

export interface VoiceCommand {
  text: string;
  timestamp: number;
}

export interface MediaState {
  isPlaying: boolean;
  query?: string;
}