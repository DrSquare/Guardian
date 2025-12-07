import React, { useState, useEffect, useCallback } from 'react';
import { performAnalysis } from '../services/genaiService';
import Button from './Button';
import { VoiceCommand, AnalysisResult } from '../types';

interface ReaderViewProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  lastVoiceCommand: VoiceCommand | null;
}

const ReaderView: React.FC<ReaderViewProps> = ({ isActive, videoRef, lastVoiceCommand }) => {
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    // English Default
    utterance.lang = 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => v.lang === 'en-US' && (v.name.includes('Google') || v.name.includes('Natural')));
    if (preferredVoice) utterance.voice = preferredVoice;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleAnalysis = useCallback(async () => {
    if (isProcessing || !videoRef.current) return;
    setIsProcessing(true);
    speak("Scanning document.");

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
        ctx.drawImage(video, 0, 0);
        const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        
        const result = await performAnalysis("Read and analyze this document, chart, or sign.", base64);
        setAnalysis(result);
        speak(result.text);
    }
    setIsProcessing(false);
  }, [videoRef, isProcessing, speak]);

  useEffect(() => {
    if (!isActive || !lastVoiceCommand) return;
    const cmd = lastVoiceCommand.text.toLowerCase();
    if (Date.now() - lastVoiceCommand.timestamp > 5000) return;

    if (cmd.includes('read') || cmd.includes('analyze') || cmd.includes('scan')) {
        handleAnalysis();
    } else if (cmd.includes('stop')) {
        window.speechSynthesis.cancel();
    }
  }, [isActive, lastVoiceCommand, handleAnalysis]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black/80 flex flex-col p-6">
       <div className="absolute top-4 left-4 text-lumen-tertiary text-xs font-mono uppercase">
          System 3: Analyst (Vision Reader)
       </div>

       {/* Viewfinder Frame */}
       <div className="flex-1 border-2 border-lumen-tertiary/50 rounded-lg relative overflow-hidden mb-6">
          <div className="absolute top-0 left-0 w-full h-1 bg-lumen-tertiary shadow-[0_0_15px_rgba(191,0,255,0.8)] animate-scanner" />
          
          {analysis && !isProcessing && (
              <div className="absolute inset-0 bg-black/90 p-4 overflow-y-auto">
                  <div className="text-white font-mono text-sm whitespace-pre-wrap">{analysis.text}</div>
                  <div className="mt-4 flex gap-2">
                     <Button variant="neutral" onClick={() => { setAnalysis(null); window.speechSynthesis.cancel(); }}>CLOSE</Button>
                  </div>
              </div>
          )}
          
          {isProcessing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <div className="text-lumen-tertiary font-bold animate-pulse">PROCESSING...</div>
              </div>
          )}
       </div>

       <div className="h-20 flex justify-center">
          {!analysis && (
             <Button variant="tertiary" onClick={handleAnalysis} fullWidth>
                CAPTURE & READ
             </Button>
          )}
       </div>
    </div>
  );
};

export default ReaderView;