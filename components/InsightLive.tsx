import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getGeminiClient, performToolSearch } from '../services/genaiService';
import { createPcmBlob, decodeAudioData, decodeBase64 } from '../services/audioService';
import { LiveServerMessage, Modality } from '@google/genai';
import { LIVE_MODEL, SYSTEM_INSTRUCTION_INSIGHT, INPUT_SAMPLE_RATE, OUTPUT_SAMPLE_RATE, SEARCH_TOOL, PLAY_TOOL } from '../constants';
import { MediaState } from '../types';

interface InsightLiveProps {
  isActive: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  isCameraReady: boolean;
  setMediaState: (state: MediaState) => void;
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
      this.port.postMessage(float32Data);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

const InsightLive: React.FC<InsightLiveProps> = ({ isActive, videoRef, isCameraReady, setMediaState }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [volume, setVolume] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const frameIntervalRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);

  const connectLive = useCallback(async () => {
    if (!videoRef.current || !isCameraReady) return;
    setStatus('connecting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      inputContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: INPUT_SAMPLE_RATE
      });

      const blob = new Blob([PCM_PROCESSOR_CODE], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      await inputContextRef.current.audioWorklet.addModule(blobUrl);
      URL.revokeObjectURL(blobUrl);

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: OUTPUT_SAMPLE_RATE
      });
      // Try to resume if suspended (autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }

      const ai = getGeminiClient();
      
      const sessionPromise = ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION_INSIGHT,
          tools: [
             { functionDeclarations: [SEARCH_TOOL, PLAY_TOOL] }
          ],
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
            // 1. Handle Audio
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && audioContextRef.current) {
              const ctx = audioContextRef.current;
              const audioBuffer = await decodeAudioData(decodeBase64(audioData), ctx, OUTPUT_SAMPLE_RATE);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.onended = () => activeSourcesRef.current.delete(source);
              const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
              source.start(startTime);
              nextStartTimeRef.current = startTime + audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            // 2. Handle Tool Calls (Search / Play)
            const toolCall = msg.toolCall;
            if (toolCall) {
                for (const fc of toolCall.functionCalls) {
                    let result: any = { result: "ok" };
                    
                    if (fc.name === 'search_google') {
                        const query = (fc.args as any).query;
                        console.log("Executing Search:", query);
                        const searchResult = await performToolSearch(query);
                        result = { result: searchResult };
                    } else if (fc.name === 'play_video') {
                        const query = (fc.args as any).query;
                        console.log("Executing Play:", query);
                        setMediaState({ isPlaying: true, query: query });
                        result = { result: `Video player started for ${query}` };
                    }

                    // Send response back
                    sessionPromise.then(session => {
                        session.sendToolResponse({
                            functionResponses: [{
                                id: fc.id,
                                name: fc.name,
                                response: result
                            }]
                        });
                    });
                }
            }

            // 3. Handle Interruption
            if (msg.serverContent?.interrupted) {
               activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
               activeSourcesRef.current.clear();
               nextStartTimeRef.current = 0; 
            }
          },
          onclose: () => setStatus('idle'),
          onerror: () => setStatus('error')
        }
      });
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }, [videoRef, isCameraReady, setMediaState]);

  const startAudioStream = (sessionPromise: Promise<any>) => {
     if (!inputContextRef.current || !streamRef.current) return;
     const ctx = inputContextRef.current;
     const source = ctx.createMediaStreamSource(streamRef.current);
     const worklet = new AudioWorkletNode(ctx, 'pcm-processor');
     workletNodeRef.current = worklet;
     worklet.port.onmessage = (e) => {
       const inputData = e.data as Float32Array;
       let sum = 0;
       const step = 50; 
       for(let i=0; i<inputData.length; i+=step) sum += inputData[i] * inputData[i];
       setVolume(Math.sqrt(sum / (inputData.length/step)));
       sessionPromise.then(session => session.sendRealtimeInput({ media: createPcmBlob(inputData) }));
     };
     source.connect(worklet);
     worklet.connect(ctx.destination);
  };

  const startVideoStream = (sessionPromise: Promise<any>) => {
    if (!videoRef.current) return;
    frameIntervalRef.current = window.setInterval(() => {
       const video = videoRef.current;
       if (!video || video.readyState < 2) return;
       const canvas = document.createElement('canvas');
       canvas.width = video.videoWidth * 0.5;
       canvas.height = video.videoHeight * 0.5;
       const ctx = canvas.getContext('2d');
       if(ctx) {
         ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
         const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
         sessionPromise.then(session => session.sendRealtimeInput({ media: { mimeType: 'image/jpeg', data: base64 } }));
       }
    }, 1500); // 0.6 FPS approx for background context
  };

  const disconnect = useCallback(() => {
    if (workletNodeRef.current) workletNodeRef.current.disconnect();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (inputContextRef.current) inputContextRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (isActive && isCameraReady) connectLive();
    else disconnect();
    return () => disconnect();
  }, [isActive, isCameraReady, connectLive, disconnect]);

  if (!isActive) return null;

  return (
    <div className="absolute bottom-32 left-0 right-0 px-6 flex flex-col items-center pointer-events-none z-10">
       <div className="flex gap-1 h-8 items-center justify-center mb-2">
          {[...Array(5)].map((_, i) => (
             <div key={i} className="w-1.5 bg-lumen-secondary rounded-full transition-all duration-75"
               style={{ height: `${Math.max(8, volume * 80 * (Math.random() * 2 + 1))}%`, opacity: status === 'connected' ? 1 : 0.3 }} />
          ))}
       </div>
    </div>
  );
};

export default InsightLive;