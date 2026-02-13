import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Station } from '../types';
import { ICONS } from '../constants';
import Hls from 'hls.js';

interface RadioPlayerProps {
  station: Station | null;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

const RadioPlayer: React.FC<RadioPlayerProps> = ({ station, isPlaying, onTogglePlay }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<{ message: string; type: 'NETWORK' | 'DECODE' | 'ACCESS' | 'OFFLINE' | 'UNKNOWN' } | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isCorsBlocked, setIsCorsBlocked] = useState(false);
  const [amplitude, setAmplitude] = useState(0); // For UI-based audio reactivity
  const [shareCopied, setShareCopied] = useState(false);
  
  const [retryStage, setRetryStage] = useState(0); 

  const isHlsStream = station?.url.includes('.m3u8') || station?.url_resolved?.includes('.m3u8');

  const getUrlForStage = useCallback((s: Station, stage: number) => {
    let url = (stage === 0 || stage === 1 || stage === 3) ? (s.url_resolved || s.url) : s.url;
    if (stage <= 1 && url.startsWith('http://') && window.location.protocol === 'https:') {
      url = url.replace('http://', 'https://');
    }
    if (stage === 5) {
      if (!url.endsWith(';') && !url.includes('?')) {
        url = url.endsWith('/') ? `${url};` : `${url}/;`;
      }
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}cb=${Date.now()}`;
    }
    return url;
  }, []);

  const handleShare = async () => {
    if (!station) return;
    const url = station.url_resolved || station.url;
    const shareData = {
      title: `VoxWorld: ${station.name}`,
      text: `Listen to ${station.name} from ${station.country} on VoxWorld!`,
      url: url
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Sharing failed:', err);
      }
    }
  };

  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    const initAudioContext = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.85;
          
          if (!sourceRef.current) {
            sourceRef.current = ctx.createMediaElementSource(audioRef.current!);
            sourceRef.current.connect(analyser);
            analyser.connect(ctx.destination);
          }
          
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
          setIsCorsBlocked(false);
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      } catch (err) {
        setIsCorsBlocked(true);
      }
    };

    let time = 0;
    const draw = () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (isPlaying && !error) {
        time += 0.05;
        
        if (analyserRef.current && !isCorsBlocked) {
          const bufferLength = analyserRef.current.frequencyBinCount;
          const freqData = new Uint8Array(bufferLength);
          const timeData = new Uint8Array(bufferLength);
          
          analyserRef.current.getByteFrequencyData(freqData);
          analyserRef.current.getByteTimeDomainData(timeData);

          // Calculate overall amplitude for the UI glow
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += freqData[i];
          setAmplitude(sum / bufferLength / 255);

          // Draw Frequency Bars (Background)
          const barWidth = (width / bufferLength) * 2;
          let x = 0;
          for (let i = 0; i < bufferLength; i++) {
            const barHeight = (freqData[i] / 255) * height;
            const hue = 190 + (i / bufferLength) * 30;
            ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.1 + (barHeight/height) * 0.4})`;
            ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
            x += barWidth;
          }

          // Draw Oscilloscope Waveform (Foreground)
          ctx.beginPath();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#38bdf8';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#0ea5e9';
          const sliceWidth = width / bufferLength;
          let waveX = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeData[i] / 128.0;
            const y = (v * height) / 2;
            if (i === 0) ctx.moveTo(waveX, y);
            else ctx.lineTo(waveX, y);
            waveX += sliceWidth;
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          // Simulated Fluid-Wave (CORS Fallback)
          setAmplitude(0.2 + Math.sin(time) * 0.1);
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
          for (let x = 0; x < width; x++) {
            const y = height / 2 + Math.sin(x * 0.03 + time) * 6 + Math.cos(x * 0.08 + time * 1.2) * 4;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          
          // Scanning pulse effect
          const pulseX = (time * 80) % (width + 100) - 50;
          const grad = ctx.createLinearGradient(pulseX - 40, 0, pulseX + 40, 0);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.4)');
          grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad;
          ctx.fillRect(pulseX - 40, 0, 80, height);
        }
      } else {
        setAmplitude(0);
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    if (isPlaying && !error) {
      if (!isCorsBlocked) initAudioContext();
      draw();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }

    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, error, isCorsBlocked]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || error) return;
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') throw err;
    }
  }, [isPlaying, error]);

  const handleManualRetry = () => {
    setRetryStage(0);
    setError(null);
    setIsBuffering(true);
    if (!isPlaying) onTogglePlay();
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    audio.pause();
    setIsBuffering(true); // Signal buffering start on source change
    if (retryStage >= 3) audio.removeAttribute('crossOrigin');
    else audio.crossOrigin = "anonymous";

    audio.src = '';
    const streamUrl = getUrlForStage(station, retryStage);

    if (streamUrl.includes('.m3u8') && Hls.isSupported() && retryStage === 0) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => { if (retryStage < 3) xhr.withCredentials = false; }
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { if (isPlaying) safePlay(); });
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) setRetryStage(prev => prev + 1); });
      hlsRef.current = hls;
    } else {
      audio.src = streamUrl;
      audio.load();
      if (isPlaying) {
        safePlay().catch(() => setRetryStage(prev => prev + 1));
      }
    }
  }, [station, retryStage, isPlaying, getUrlForStage, safePlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePlaybackError = () => {
      if (retryStage >= 5) {
        setIsBuffering(false);
        const mediaError = audio.error;
        let type: 'NETWORK' | 'DECODE' | 'ACCESS' | 'OFFLINE' | 'UNKNOWN' = 'UNKNOWN';
        let displayMsg = "This frequency is unreachable.";
        if (window.location.protocol === 'https:' && audio.src.startsWith('http://')) {
          displayMsg = "Security Block: Insecure stream.";
          type = 'ACCESS';
        } else if (mediaError) {
          if (mediaError.code === 2) { displayMsg = "Network error: Connection failed."; type = 'NETWORK'; }
          else if (mediaError.code === 3) { displayMsg = "Format unsupported."; type = 'DECODE'; }
          else { displayMsg = "Station offline or format incompatible."; type = 'OFFLINE'; }
        }
        setError({ message: displayMsg, type });
      } else {
        setRetryStage(prev => prev + 1);
      }
    };
    const handleCanPlay = () => { setIsBuffering(false); setError(null); };
    const handleWaiting = () => setIsBuffering(true);
    audio.addEventListener('error', handlePlaybackError);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleWaiting);
    return () => {
      audio.removeEventListener('error', handlePlaybackError);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleWaiting);
    };
  }, [retryStage]);

  useEffect(() => { setRetryStage(0); setError(null); }, [station?.stationuuid]);

  if (!station) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-white/5 z-50 flex items-center px-4 md:px-8 shadow-[0_-15px_50px_rgba(0,0,0,0.6)]">
      <audio ref={audioRef} />
      
      <div className="flex items-center gap-4 w-full max-w-7xl mx-auto">
        {/* Station Identity */}
        <div className="flex items-center gap-4 min-w-0 md:w-1/3">
          <div 
            className="w-12 h-12 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/5 relative shadow-inner transition-shadow duration-100"
            style={{ 
              boxShadow: isPlaying && !error ? `0 0 ${amplitude * 30}px rgba(14, 165, 233, ${amplitude * 0.5})` : 'none',
              borderColor: isPlaying && !error ? `rgba(14, 165, 233, ${0.1 + amplitude})` : 'rgba(255,255,255,0.05)'
            }}
          >
            {station.favicon ? (
              <img src={station.favicon} alt="" className="w-full h-full object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')}/>
            ) : ( <ICONS.Radio /> )}
            {isBuffering && !error && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-white truncate text-sm leading-tight">{station.name}</h3>
            {error ? (
              <div className="flex flex-col gap-0.5 mt-0.5">
                <span className="text-[8px] font-bold text-rose-400 uppercase tracking-wider">{error.type === 'ACCESS' ? 'SECURITY BLOCK' : 'SIGNAL LOST'}</span>
                <span className="text-[9px] text-slate-500 truncate">{error.message}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 mt-0.5">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-500 truncate">{station.country}</p>
                  <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                  <p className="text-[10px] text-sky-400 font-bold uppercase tracking-tighter opacity-80">{station.codec}</p>
                </div>
                {isCorsBlocked && isHlsStream && isPlaying && (
                  <div className="flex items-center gap-1 animate-in fade-in duration-500">
                    <span className="w-1 h-1 rounded-full bg-amber-500 animate-pulse"></span>
                    <p className="text-[8px] text-amber-500/80 font-medium truncate">
                      CORS restricted. Try another station for full visualizer.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Playback Controls & Visualizer */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <button 
            onClick={onTogglePlay}
            className={`w-11 h-11 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-xl relative z-10 ${
              error ? 'bg-slate-800 text-slate-600' : 
              isBuffering ? 'bg-sky-50 text-sky-500 animate-pulse' : 
              'bg-white text-black hover:bg-sky-50'
            }`}
            style={{
              boxShadow: isPlaying && !error && !isBuffering ? `0 0 ${amplitude * 40}px rgba(14, 165, 233, ${amplitude * 0.6})` : 
                         isBuffering ? `0 0 25px rgba(14, 165, 233, 0.5)` :
                         '0 10px 20px rgba(0,0,0,0.3)'
            }}
          >
            {isPlaying && !error ? <ICONS.Pause /> : <ICONS.Play />}
          </button>
          
          <div className="w-full max-w-[320px] h-6 relative hidden md:block group">
            <div className={`absolute inset-0 bg-sky-500/5 rounded-full blur-xl transition-opacity duration-700 ${isPlaying && !error ? 'opacity-100' : 'opacity-0'}`}></div>
            <canvas ref={canvasRef} width={320} height={24} className={`w-full h-full relative z-10 transition-opacity duration-1000 ${isPlaying && !error ? 'opacity-100' : 'opacity-20'}`} />
            
            {error && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/95 rounded-lg text-[9px] text-rose-400 font-bold px-2 text-center border border-rose-500/20 backdrop-blur-sm">
                CONNECTION FAILED • <button onClick={handleManualRetry} className="underline ml-1.5 hover:text-white transition-colors">TUNER RESET</button>
              </div>
            )}
            
            {!isPlaying && !error && station && (
              <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                <span className="text-[7px] text-slate-600 font-bold uppercase tracking-[0.4em] animate-pulse">Ready to Broadcast</span>
              </div>
            )}

            {isCorsBlocked && isPlaying && !error && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <span className="text-[6px] text-slate-500 font-bold uppercase bg-black/70 px-2 py-0.5 rounded-full whitespace-nowrap border border-white/5">
                  {isHlsStream ? 'Source blocks CORS (Analog Mode)' : 'Analog Processing (CORS)'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Volume & Utility */}
        <div className="hidden md:flex items-center justify-end gap-4 w-1/3">
          <button 
            onClick={handleShare}
            className={`p-2.5 rounded-full transition-all relative group/share ${
              shareCopied ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20 scale-110' : 'bg-slate-900/50 text-slate-400 hover:text-sky-400 border border-white/5 hover:border-sky-500/20'
            }`}
          >
            {shareCopied ? <ICONS.Check /> : <ICONS.Share />}
            {shareCopied && (
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[10px] font-bold px-2 py-1 rounded shadow-xl animate-in fade-in zoom-in-50 duration-200">
                COPIED!
              </span>
            )}
            <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] font-bold px-2 py-0.5 rounded opacity-0 group-hover/share:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/5">
              Share Station
            </span>
          </button>

          <div className="flex items-center gap-3 w-32 bg-slate-900/50 px-4 py-2 rounded-full border border-white/5 backdrop-blur-sm">
            <div className="text-slate-500 transition-colors hover:text-sky-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" className={volume === 0 ? 'opacity-20' : ''}></path>
              </svg>
            </div>
            <input 
              type="range" min="0" max="1" step="0.01" 
              value={volume} 
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-sky-400 transition-all"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadioPlayer;