export enum AppMode {
  GUARDIAN = 'GUARDIAN', // System 1: Reflexes
  INSIGHT = 'INSIGHT',   // System 2: Cognition (Live)
  READER = 'READER'      // System 3: Analysis (Static)
}

export interface Hazard {
  x: number;
  y: number;
  width: number;
  height: number;
  severity: 'low' | 'high';
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  isFinal?: boolean;
}

export interface ReaderResult {
  text: string;
  type: 'document' | 'chart' | 'unknown';
}

export interface VolumeState {
  isSpeaking: boolean; // User is speaking (VAD)
  volume: number;      // Current decibel level 0-100
}

export interface VoiceCommand {
  text: string;
  timestamp: number;
}
