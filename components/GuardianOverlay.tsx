import React, { useEffect, useRef, useState } from 'react';
import { Hazard } from '../types';

interface GuardianOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  isActive: boolean;
}

const GuardianOverlay: React.FC<GuardianOverlayProps> = ({ videoRef, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const lastFrameRef = useRef<ImageData | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastAlertTimeRef = useRef<number>(0);

  // Initialize Audio Context for Alerts
  useEffect(() => {
    if (isActive && !audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return () => {
        if (!isActive && audioCtxRef.current) {
            audioCtxRef.current.close();
            audioCtxRef.current = null;
        }
    };
  }, [isActive]);

  const triggerAlert = () => {
    const now = Date.now();
    // Debounce alerts (max 1 every 250ms) to prevent audio spam
    if (now - lastAlertTimeRef.current < 250) return;
    lastAlertTimeRef.current = now;

    // 1. Haptic Feedback
    if (navigator.vibrate) {
        navigator.vibrate(200); // 200ms buzz
    }

    // 2. Audio Feedback
    if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        // Urgent "Sawtooth" beep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime); 
        osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.1); // Slide up pitch
        
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

        osc.start();
        osc.stop(ctx.currentTime + 0.1);
    }
  };

  // Simulated Edge AI - Motion Detection Logic
  useEffect(() => {
    if (!isActive || !videoRef.current) return;

    // We need to wait for the canvas ref to be attached
    const video = videoRef.current;
    let animationFrameId: number;

    const processFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
          animationFrameId = requestAnimationFrame(processFrame);
          return;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Downsample for performance (System 1 goal: Low Latency)
        const w = 64; // Low res grid
        const h = 48;
        
        canvas.width = w;
        canvas.height = h;

        ctx.drawImage(video, 0, 0, w, h);
        const currentFrame = ctx.getImageData(0, 0, w, h);

        if (lastFrameRef.current) {
          // Compare with last frame to find movement (Simulated Hazard)
          const detectedHazards: Hazard[] = [];
          const data = currentFrame.data;
          const lastData = lastFrameRef.current.data;
          let significantChange = 0;
          let hazardX = 0;
          let hazardY = 0;

          // Simple pixel difference loop
          for (let i = 0; i < data.length; i += 4) {
             const diff = Math.abs(data[i] - lastData[i]); // Check Red channel only for speed
             if (diff > 50) {
               significantChange++;
               // Rough center of mass
               hazardX += (i / 4) % w;
               hazardY += Math.floor((i / 4) / w);
             }
          }

          if (significantChange > 100) {
            const isHighSeverity = significantChange > 500;
            detectedHazards.push({
              x: (hazardX / significantChange) / w,
              y: (hazardY / significantChange) / h,
              width: 0.3,
              height: 0.3,
              severity: isHighSeverity ? 'high' : 'low'
            });

            if (isHighSeverity) {
                triggerAlert();
            }
          }
          setHazards(detectedHazards);
        }
        
        lastFrameRef.current = currentFrame;
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    processFrame();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isActive, videoRef]);

  if (!isActive) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* Hidden Canvas for processing - Crucial for detection to work */}
      <canvas ref={canvasRef} className="hidden" />

      {/* HUD Grid */}
      <div className="absolute inset-0 border-2 border-lumen-primary/30 rounded-lg">
        <div className="absolute top-4 left-4 text-lumen-primary text-xs font-mono animate-pulse">
          SYSTEM 1: ACTIVE <br/>
          LATENCY: &lt;16ms
        </div>
        <div className="w-full h-full opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-lumen-primary to-transparent" />
      </div>

      {/* Detected Hazards */}
      {hazards.map((h, i) => (
        <div
          key={i}
          className={`absolute border-2 ${h.severity === 'high' ? 'border-lumen-alert bg-lumen-alert/10' : 'border-lumen-primary bg-lumen-primary/10'} transition-all duration-100 ease-linear`}
          style={{
            left: `${(h.x - h.width/2) * 100}%`,
            top: `${(h.y - h.height/2) * 100}%`,
            width: `${h.width * 100}%`,
            height: `${h.height * 100}%`
          }}
        >
          <div className={`absolute -top-6 left-0 text-[10px] font-bold ${h.severity === 'high' ? 'text-lumen-alert' : 'text-lumen-primary'}`}>
             {h.severity === 'high' ? '⚠ HAZARD' : 'DETECTED'}
          </div>
        </div>
      ))}

      {/* Safety Warning Overlay if High Hazard */}
      {hazards.some(h => h.severity === 'high') && (
        <div className="absolute inset-0 border-4 border-lumen-alert animate-pulse-fast flex items-center justify-center">
             <div className="bg-black/80 p-4 rounded text-lumen-alert font-bold text-2xl tracking-widest border border-lumen-alert">
               STOP
             </div>
        </div>
      )}
    </div>
  );
};

export default GuardianOverlay;