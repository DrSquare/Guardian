import React, { useState, useRef, useEffect } from 'react';
import { AppMode, VoiceCommand, MediaState } from './types';
import Button from './components/Button';
import GuardianOverlay from './components/GuardianOverlay';
import InsightLive from './components/InsightLive';
import ReaderView from './components/ReaderView';

const App: React.FC = () => {
  // Mode State: Insight is Default. Analyst is specialized.
  const [mode, setMode] = useState<AppMode>(AppMode.INSIGHT);
  
  // Feature Toggles
  const [isReflexActive, setIsReflexActive] = useState(false); // Guardian Overlay
  
  // Media State (Search/Play results from Insight)
  const [mediaState, setMediaState] = useState<MediaState>({ isPlaying: false });

  const [lastVoiceCommand, setLastVoiceCommand] = useState<VoiceCommand | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  
  const modeRef = useRef(mode);
  const reflexRef = useRef(isReflexActive);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { reflexRef.current = isReflexActive; }, [isReflexActive]);

  // Voice Recognition
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US'; // Default to English

    recognition.onspeechstart = () => {
        window.speechSynthesis.cancel(); // Barge-in
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      const transcript = event.results[event.resultIndex][0].transcript.toLowerCase().trim();
      console.log('Voice:', transcript);

      // 1. Reflex / Guardian Control
      if (transcript.includes('start guardian') || transcript.includes('start reflex')) {
        setIsReflexActive(true);
        return;
      }
      if (transcript.includes('stop guardian') || transcript.includes('end guardian')) {
        setIsReflexActive(false);
        return;
      }

      // 2. Analyst / Reader Control
      if (transcript.includes('start analyst') || transcript.includes('start reader') || transcript.includes('read this')) {
        setMode(AppMode.ANALYST);
        // Pass command to trigger read immediately if phrased as "read this"
        setLastVoiceCommand({ text: transcript, timestamp: Date.now() });
        return;
      }
      if (transcript.includes('stop analyst') || transcript.includes('stop reader')) {
        setMode(AppMode.INSIGHT);
        return;
      }

      // 3. Media Control
      if (transcript.includes('stop music') || transcript.includes('stop video')) {
          setMediaState({ isPlaying: false });
          return;
      }

      // 4. Pass through context commands
      if (modeRef.current === AppMode.ANALYST) {
         setLastVoiceCommand({ text: transcript, timestamp: Date.now() });
      }
    };

    recognition.onend = () => { try { recognition.start(); } catch(e){} };
    try { recognition.start(); } catch(e){}
    return () => { recognition.stop(); };
  }, []);

  // Camera Init
  useEffect(() => {
    const initCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setIsCameraReady(true);
          };
        }
      } catch (err) {
        setStreamError("Camera access denied.");
      }
    };
    initCamera();
  }, []);

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex flex-col relative font-sans text-white">
      
      {/* 0. Background Feed */}
      <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-transparent to-black/90 pointer-events-none" />

      {/* 1. Header */}
      <div className="absolute top-0 left-0 right-0 p-4 z-50 flex justify-between items-start pointer-events-none">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white/90">LUMEN <span className="text-[10px] opacity-50">v2.1</span></h1>
        </div>
        <div className="flex flex-col gap-1 items-end">
             {/* Status Indicators */}
             <div className="flex gap-2">
                 {isReflexActive && <span className="text-[10px] font-bold text-lumen-primary bg-lumen-primary/10 px-2 py-0.5 rounded border border-lumen-primary">REFLEX</span>}
                 {mode === AppMode.INSIGHT && <span className="text-[10px] font-bold text-lumen-secondary bg-lumen-secondary/10 px-2 py-0.5 rounded border border-lumen-secondary">INSIGHT</span>}
                 {mode === AppMode.ANALYST && <span className="text-[10px] font-bold text-lumen-tertiary bg-lumen-tertiary/10 px-2 py-0.5 rounded border border-lumen-tertiary">ANALYST</span>}
             </div>
        </div>
      </div>

      {/* 2. Layers */}
      
      {/* Layer A: Guardian (Reflex) - Always renders if active, overlays everything */}
      <GuardianOverlay videoRef={videoRef} isActive={isReflexActive} />

      {/* Layer B: Insight (Live) - Renders in background unless Analyst is full screen */}
      <InsightLive 
          isActive={mode === AppMode.INSIGHT} 
          videoRef={videoRef} 
          isCameraReady={isCameraReady}
          setMediaState={setMediaState}
      />

      {/* Layer C: Analyst (Reader) - Full screen takeover */}
      <ReaderView 
          isActive={mode === AppMode.ANALYST} 
          videoRef={videoRef}
          lastVoiceCommand={lastVoiceCommand}
      />

      {/* Layer D: Global Media Player */}
      {mediaState.isPlaying && mediaState.query && (
          <div className="absolute top-20 right-4 w-48 z-40 bg-black border border-lumen-secondary shadow-lg rounded-lg overflow-hidden">
               <div className="aspect-video w-full bg-black">
                   <iframe 
                       width="100%" height="100%" 
                       src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(mediaState.query)}&autoplay=1`} 
                       frameBorder="0" allow="autoplay"
                   ></iframe>
               </div>
               <div className="p-2 flex justify-between items-center">
                   <span className="text-[10px] truncate max-w-[100px]">{mediaState.query}</span>
                   <button onClick={() => setMediaState({isPlaying: false})} className="text-red-500 text-xs font-bold">CLOSE</button>
               </div>
          </div>
      )}

      {/* 3. Controls */}
      {mode !== AppMode.ANALYST && (
          <div className="absolute bottom-0 left-0 right-0 p-6 z-50 flex flex-col gap-4">
              {/* Reflex Toggle */}
              <Button 
                 variant={isReflexActive ? 'primary' : 'neutral'} 
                 onClick={() => setIsReflexActive(!isReflexActive)}
                 className="py-3 text-sm"
              >
                 {isReflexActive ? 'STOP REFLEX (GUARDIAN)' : 'START REFLEX (GUARDIAN)'}
              </Button>

              {/* Mode Switch to Analyst */}
              <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-lumen-secondary/10 border border-lumen-secondary/30 flex items-center justify-center">
                      <div className="text-center">
                          <div className="text-lumen-secondary font-bold text-sm">INSIGHT ACTIVE</div>
                          <div className="text-[10px] text-gray-400">Ask for Search, Prices, or Music</div>
                      </div>
                  </div>
                  <Button variant="tertiary" onClick={() => setMode(AppMode.ANALYST)}>
                      OPEN ANALYST
                  </Button>
              </div>
          </div>
      )}

    </div>
  );
};

export default App;