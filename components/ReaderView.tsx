import React, { useState, useEffect, useCallback } from 'react';
import { analyzeImage } from '../services/genaiService';
import Button from './Button';
import { VoiceCommand } from '../types';

interface ReaderViewProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  lastVoiceCommand: VoiceCommand | null;
}

const ReaderView: React.FC<ReaderViewProps> = ({ isActive, videoRef, lastVoiceCommand }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);

  const speak = useCallback((text: string) => {
    window.speechSynthesis.cancel(); // Stop current
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Attempt to pick a better voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v => 
        (v.name.includes('Google') && v.name.includes('US English')) || 
        v.name.includes('Natural')
    );
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleStopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const handleCapture = useCallback(async (customPrompt?: string) => {
    if (!videoRef.current || isAnalyzing) return;
    
    // If specific prompt (question) and we have an image, reuse it.
    // Otherwise capture new.
    let imageToAnalyze = currentImage;

    // Feedback for user
    if (!customPrompt) {
        speak("Scanning document.");
    } else {
        speak("Thinking.");
    }

    if (!customPrompt || !imageToAnalyze) {
        setIsAnalyzing(true);
        // Do not clear analysis immediately so the user can still see the old text while processing new
        // setAnalysis(null); 
        handleStopSpeaking();
        
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
            ctx.drawImage(video, 0, 0);
            imageToAnalyze = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            setCurrentImage(imageToAnalyze);
        }
    } else {
        setIsAnalyzing(true);
    }

    if (imageToAnalyze) {
        // Short delay to allow TTS "Scanning" to complete if needed, though usually async
        const result = await analyzeImage(imageToAnalyze, customPrompt);
        setAnalysis(result);
        speak(result);
    }
    
    setIsAnalyzing(false);
  }, [videoRef, isAnalyzing, currentImage, speak, handleStopSpeaking]);

  // Voice Command Processor
  useEffect(() => {
    if (!isActive || !lastVoiceCommand) return;
    
    // Use timestamp to ensure every command is processed, even if text is identical
    const cmd = lastVoiceCommand.text.toLowerCase();
    const timestamp = lastVoiceCommand.timestamp;

    // Check if command is recent (within 5 seconds) to avoid processing stale state on mount
    if (Date.now() - timestamp > 5000) return;

    // 1. Capture Commands
    if (cmd.includes('read') || cmd.includes('analyze') || cmd.includes('scan')) {
        handleCapture(); 
    } 
    // 2. Stop Commands
    else if (cmd.includes('stop') || cmd.includes('silence') || cmd.includes('quiet')) {
        handleStopSpeaking();
    } 
    // 3. Question / Follow-up (Contextual)
    else if (currentImage) {
        // Assume it's a question about the current image
        handleCapture(cmd);
    }
  }, [isActive, lastVoiceCommand, handleCapture, handleStopSpeaking, currentImage]);

  // Cleanup on unmount/inactive
  useEffect(() => {
    if (!isActive) {
        handleStopSpeaking();
        setAnalysis(null);
        setCurrentImage(null);
    }
  }, [isActive, handleStopSpeaking]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 z-30 pointer-events-none flex flex-col">
       {/* Scanner UI Overlay */}
       <div className="relative flex-1 m-6 border-2 border-lumen-tertiary/50 rounded-lg overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-lumen-tertiary shadow-[0_0_15px_rgba(191,0,255,0.8)] animate-scanner" />
          <div className="absolute top-2 left-2 text-lumen-tertiary text-xs font-mono">SYSTEM 3: ANALYSIS</div>
          
          {/* Analysis Result Modal */}
          {analysis && (
            <div className="absolute inset-0 bg-black/90 p-6 overflow-y-auto pointer-events-auto backdrop-blur-sm flex flex-col">
               <div className="flex justify-between items-center mb-4 border-b border-lumen-tertiary/30 pb-2">
                   <h3 className="text-lumen-tertiary font-bold text-lg">
                     VISUAL INTERPRETATION
                   </h3>
                   {isSpeaking && (
                       <div className="flex gap-1 items-center">
                           <span className="w-1 h-3 bg-lumen-tertiary animate-[pulse_0.5s_infinite]"></span>
                           <span className="w-1 h-5 bg-lumen-tertiary animate-[pulse_0.5s_infinite_0.1s]"></span>
                           <span className="w-1 h-3 bg-lumen-tertiary animate-[pulse_0.5s_infinite_0.2s]"></span>
                       </div>
                   )}
               </div>
               
               <div className="text-white font-mono text-sm leading-relaxed whitespace-pre-wrap mb-20">
                 {analysis}
               </div>

               {/* Result Actions */}
               <div className="absolute bottom-0 left-0 right-0 p-4 bg-black/90 flex flex-col gap-2">
                   {isSpeaking && (
                       <Button variant="alert" onClick={handleStopSpeaking} className="py-2">
                           STOP SPEAKING
                       </Button>
                   )}
                   <Button 
                     variant="tertiary" 
                     onClick={() => { setAnalysis(null); handleStopSpeaking(); }}
                     className="py-2"
                   >
                     CLOSE ANALYSIS
                   </Button>
               </div>
            </div>
          )}
       </div>

       {/* Controls */}
       <div className="h-32 pointer-events-auto px-6 flex items-center justify-center">
          {!analysis && (
            <div className="flex flex-col gap-2 w-full max-w-sm">
                 {/* Hint */}
                 <div className="text-center text-[10px] text-lumen-tertiary/70 font-mono mb-2">
                    SAY "READ THIS" OR "ANALYZE"
                 </div>

                <Button 
                variant="tertiary" 
                onClick={() => handleCapture()}
                disabled={isAnalyzing}
                className="w-full shadow-[0_0_30px_rgba(191,0,255,0.2)]"
                >
                {isAnalyzing ? (
                    <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Processing Cortex...
                    </span>
                ) : (
                    "CAPTURE & ANALYZE"
                )}
                </Button>
            </div>
          )}
       </div>
    </div>
  );
};

export default ReaderView;