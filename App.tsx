import React, { useState, useRef, useEffect } from 'react';
import { AppMode, VoiceCommand } from './types';
import Button from './components/Button';
import GuardianOverlay from './components/GuardianOverlay';
import InsightLive from './components/InsightLive';
import ReaderView from './components/ReaderView';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.GUARDIAN);
  const [isGuardianActive, setIsGuardianActive] = useState(false);
  const [lastVoiceCommand, setLastVoiceCommand] = useState<VoiceCommand | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  // Ref to track mode inside the closure of the speech recognition callback
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Voice Command Setup
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    // Barge-in capability: Stop TTS immediately when sound is detected
    recognition.onspeechstart = () => {
        window.speechSynthesis.cancel();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript.toLowerCase().trim();
      console.log('Voice Command recognized:', transcript);

      // Global Commands
      if (transcript.includes('start guardian')) {
        setMode(AppMode.GUARDIAN);
        setIsGuardianActive(true);
        return;
      }
      
      if (transcript.includes('end guardian') || transcript.includes('stop guardian')) {
        setIsGuardianActive(false);
        return;
      }

      if (transcript.includes('start insight')) {
        setMode(AppMode.INSIGHT);
        setIsGuardianActive(false);
        return;
      }

      if (transcript.includes('end insight') || transcript.includes('stop insight')) {
        setMode(AppMode.GUARDIAN);
        setIsGuardianActive(false);
        return;
      }

      if (transcript.includes('start reader')) {
        setMode(AppMode.READER);
        setIsGuardianActive(false);
        return;
      }

      if (transcript.includes('end reader') || transcript.includes('stop reader')) {
        setMode(AppMode.GUARDIAN);
        setIsGuardianActive(false);
        return;
      }

      // Context Specific Commands
      if (modeRef.current === AppMode.READER) {
         setLastVoiceCommand({ text: transcript, timestamp: Date.now() });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
           console.log("Voice command status:", event.error);
        }
    };

    // Auto-restart for continuous listening
    recognition.onend = () => {
        try {
            recognition.start();
        } catch (e) {
            // Ignore start errors if already started
        }
    };

    try {
        recognition.start();
    } catch(e) {
        console.error("Failed to start voice recognition", e);
    }

    return () => {
        recognition.onend = null; 
        recognition.stop();
        window.speechSynthesis.cancel(); // Clean up audio on unmount
    };
  }, []);

  // Initialize Camera
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera Error:", err);
        setStreamError("Camera access denied. Please enable permissions.");
      }
    };
    initCamera();
  }, []);

  const toggleGuardian = () => {
    setIsGuardianActive(!isGuardianActive);
  };

  return (
    <div className="h-screen w-screen bg-lumen-black overflow-hidden flex flex-col relative">
      
      {/* Background Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-60"
      />
      
      {/* Vignette Overlay for aesthetics */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#050505_120%)] pointer-events-none" />

      {/* Error State */}
      {streamError && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-8 text-center">
           <div className="text-lumen-alert font-mono border border-lumen-alert p-4 rounded">
             CRITICAL ERROR: {streamError}
           </div>
        </div>
      )}

      {/* Header / Mode Indicator */}
      <div className="absolute top-0 left-0 right-0 p-4 z-40 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-2xl font-bold tracking-tighter text-white">LUMEN <span className="text-xs font-mono opacity-50">v2.0</span></h1>
          <p className="text-[10px] font-mono text-gray-400">DIGITAL VISUAL CORTEX</p>
        </div>
        <div className="text-right flex flex-col items-end gap-1">
           <div className={`text-xs font-mono font-bold px-2 py-1 rounded border ${
             mode === AppMode.GUARDIAN ? 'border-lumen-primary text-lumen-primary' :
             mode === AppMode.INSIGHT ? 'border-lumen-secondary text-lumen-secondary' :
             'border-lumen-tertiary text-lumen-tertiary'
           }`}>
             {mode}
           </div>
           {/* Voice Active Indicator */}
           <div className="flex items-center gap-1 opacity-50">
             <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
             <span className="text-[8px] font-mono text-gray-400 uppercase tracking-wider">Voice Cmd Ready</span>
           </div>
        </div>
      </div>

      {/* System 1: Guardian Overlay */}
      <GuardianOverlay 
        videoRef={videoRef} 
        isActive={mode === AppMode.GUARDIAN && isGuardianActive} 
      />

      {/* System 2: Insight Live Interface */}
      <InsightLive 
        isActive={mode === AppMode.INSIGHT} 
        videoRef={videoRef}
      />

      {/* System 3: Reader Interface */}
      <ReaderView 
        isActive={mode === AppMode.READER} 
        videoRef={videoRef}
        lastVoiceCommand={lastVoiceCommand}
      />

      {/* Main Controls (Sticky Bottom) */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-50 bg-gradient-to-t from-black via-black/90 to-transparent pt-12">
        <div className="max-w-md mx-auto flex flex-col gap-4">
          
          {/* Dynamic Action Area */}
          {mode === AppMode.GUARDIAN && (
             <Button 
               variant={isGuardianActive ? 'alert' : 'primary'} 
               fullWidth 
               onClick={toggleGuardian}
               className="h-20 text-xl shadow-lg"
             >
               {isGuardianActive ? 'STOP GUARDIAN' : 'START GUARDIAN'}
             </Button>
          )}

          {/* Mode Switcher */}
          <div className="grid grid-cols-3 gap-2">
            <button 
              onClick={() => { setMode(AppMode.GUARDIAN); setIsGuardianActive(false); }}
              className={`p-2 rounded flex flex-col items-center gap-1 transition-all ${mode === AppMode.GUARDIAN ? 'text-lumen-primary bg-lumen-primary/10' : 'text-gray-500'}`}
            >
              <div className="w-full h-1 bg-current rounded-full mb-1" />
              <span className="text-[10px] font-mono uppercase">Reflex</span>
            </button>
            <button 
              onClick={() => { setMode(AppMode.INSIGHT); setIsGuardianActive(false); }}
              className={`p-2 rounded flex flex-col items-center gap-1 transition-all ${mode === AppMode.INSIGHT ? 'text-lumen-secondary bg-lumen-secondary/10' : 'text-gray-500'}`}
            >
              <div className="w-full h-1 bg-current rounded-full mb-1" />
              <span className="text-[10px] font-mono uppercase">Insight</span>
            </button>
            <button 
              onClick={() => { setMode(AppMode.READER); setIsGuardianActive(false); }}
              className={`p-2 rounded flex flex-col items-center gap-1 transition-all ${mode === AppMode.READER ? 'text-lumen-tertiary bg-lumen-tertiary/10' : 'text-gray-500'}`}
            >
              <div className="w-full h-1 bg-current rounded-full mb-1" />
              <span className="text-[10px] font-mono uppercase">Reader</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default App;