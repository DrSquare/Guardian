import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getGeminiClient } from '../services/genaiService';
import { createPcmBlob, decodeAudioData, decodeBase64 } from '../services/audioService';
import { LiveServerMessage, Modality } from '@google/genai';
import { LIVE_MODEL, SYSTEM_INSTRUCTION_INSIGHT, INPUT_SAMPLE_RATE, OUTPUT_SAMPLE_RATE } from '../constants';

interface InsightLiveProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
}

// AudioWorklet Processor Code
const PCM_PROCESSOR_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const float32Data = input[0];
      // Post data back to main thread
      this.port.postMessage(float32Data);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

const InsightLive: React.FC<InsightLiveProps> = ({ isActive, videoRef }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [volume, setVolume] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const frameIntervalRef = useRef<number>(0);
  
  // Audio Queue Management for smooth playback and interruption
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Establish Live Connection
  const connectLive = useCallback(async () => {
    if (!videoRef.current) return;
    setStatus('connecting');

    try {
      // 1. Setup Audio Input (Mic)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE
      });

      // Load AudioWorklet
      const blob = new Blob([PCM_PROCESSOR_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await inputContextRef.current.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      // 2. Setup Audio Output (Speaker)
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE
      });

      const ai = getGeminiClient();
      
      // 3. Connect to Gemini Live
      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION_INSIGHT,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        },
        callbacks: {
          onopen: () => {
            console.log("Insight Live Connected");
            setStatus('connected');
            startAudioStream(sessionPromise);
            startVideoStream(sessionPromise);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio Response
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const ctx = audioContextRef.current;
              const audioBuffer = await decodeAudioData(
                decodeBase64(audioData),
                ctx,
                OUTPUT_SAMPLE_RATE
              );
              
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => {
                activeSourcesRef.current.delete(source);
              };

              // Gapless playback logic
              const currentTime = ctx.currentTime;
              // Ensure we don't schedule in the past, but try to keep flow
              const startTime = Math.max(currentTime, nextStartTimeRef.current);
              
              source.start(startTime);
              nextStartTimeRef.current = startTime + audioBuffer.duration;
              
              // Track active source for interruption
              activeSourcesRef.current.add(source);
            }

            // Handle interruption (Server VAD)
            if (msg.serverContent?.interrupted) {
               console.log("Interrupted by user");
               // Stop all currently playing audio immediately
               activeSourcesRef.current.forEach(source => {
                 try { source.stop(); } catch(e) { /* ignore */ }
               });
               activeSourcesRef.current.clear();
               nextStartTimeRef.current = 0; 
            }
          },
          onclose: () => {
            console.log("Insight Live Closed");
            setStatus('idle');
          },
          onerror: (err) => {
            console.error("Insight Live Error", err);
            setStatus('error');
          }
        }
      });

    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }, [videoRef]);

  const startAudioStream = (sessionPromise: Promise<any>) => {
     if (!inputContextRef.current || !streamRef.current) return;
     
     const ctx = inputContextRef.current;
     const source = ctx.createMediaStreamSource(streamRef.current);
     const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
     workletNodeRef.current = worklet;

     worklet.port.onmessage = (e) => {
       const inputData = e.data as Float32Array;
       
       // Calculate volume for UI
       let sum = 0;
       // Sample a subset for performance
       const step = Math.floor(inputData.length / 50) || 1;
       for(let i=0; i<inputData.length; i+=step) sum += inputData[i] * inputData[i];
       setVolume(Math.sqrt(sum / (inputData.length/step)));

       const blob = createPcmBlob(inputData);
       sessionPromise.then(session => {
         session.sendRealtimeInput({ media: blob });
       });
     };

     source.connect(worklet);
     worklet.connect(ctx.destination); // Connect to destination to keep graph alive, but maybe mute it?
  };

  const startVideoStream = (sessionPromise: Promise<any>) => {
    if (!videoRef.current) return;
    
    // Send frames at ~1 FPS to save bandwidth while maintaining context
    frameIntervalRef.current = window.setInterval(() => {
       const video = videoRef.current;
       if (!video || video.readyState < 2) return;

       const canvas = document.createElement('canvas');
       const scale = 0.5; // Downscale
       canvas.width = video.videoWidth * scale;
       canvas.height = video.videoHeight * scale;
       const ctx = canvas.getContext('2d');
       if(ctx) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
         
         sessionPromise.then(session => {
           session.sendRealtimeInput({
             media: {
               mimeType: 'image/jpeg',
               data: base64
             }
           });
         });
       }
    }, 1000);
  };

  const disconnect = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    
    // Clear active sources
    activeSourcesRef.current.forEach(s => {
      try { s.stop(); } catch(e){}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setStatus('idle');
  }, []);

  // Effect to manage lifecycle based on isActive prop
  useEffect(() => {
    if (isActive) {
      connectLive();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [isActive, connectLive, disconnect]);

  if (!isActive) return null;

  return (
    <div className="absolute bottom-32 left-0 right-0 px-6 flex flex-col items-center pointer-events-none">
       {/* Audio Waveform Viz */}
       <div className="flex gap-1 h-12 items-center justify-center mb-4">
          {[...Array(5)].map((_, i) => (
             <div 
               key={i}
               className="w-2 bg-lumen-secondary rounded-full transition-all duration-75"
               style={{ 
                 height: `${Math.max(10, volume * 100 * (Math.random() * 2 + 1))}%`,
                 opacity: status === 'connected' ? 1 : 0.3
               }}
             />
          ))}
       </div>

       <div className={`
         px-6 py-2 rounded-full border border-lumen-secondary/50 bg-black/80 backdrop-blur-md
         text-lumen-secondary font-mono text-sm uppercase tracking-widest flex items-center gap-3 shadow-[0_0_20px_rgba(0,224,255,0.2)]
       `}>
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-lumen-secondary animate-pulse' : 'bg-gray-500'}`} />
          {status === 'connecting' ? 'Linking Neural Net...' : 'Insight Active'}
       </div>
    </div>
  );
};

export default InsightLive;