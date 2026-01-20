
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
  
  // Stages for retry logic:
  // 0: Resolved URL, Force HTTPS, CORS, HLS (if applicable)
  // 1: Resolved URL, Native, CORS
  // 2: Original URL, Native, CORS
  // 3: Resolved URL, Native, NO-CORS
  // 4: Original URL, Native, NO-CORS
  // 5: Original URL, Shoutcast Hack (semicolon), NO-CORS, Cache-buster
  const [retryStage, setRetryStage] = useState(0); 

  const getUrlForStage = useCallback((s: Station, stage: number) => {
    let url = (stage === 0 || stage === 1 || stage === 3) ? (s.url_resolved || s.url) : s.url;
    
    // Stage 0-1: Try HTTPS upgrade
    if (stage <= 1 && url.startsWith('http://') && window.location.protocol === 'https:') {
      url = url.replace('http://', 'https://');
    }
    
    // Stage 5: Final legacy Shoutcast/Icecast fallback hacks
    if (stage === 5) {
      if (!url.endsWith(';') && !url.includes('?')) {
        url = url.endsWith('/') ? `${url};` : `${url}/;`;
      }
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}cb=${Date.now()}`;
    }
    
    return url;
  }, []);

  // Visualizer Logic
  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    const initAudioContext = () => {
      try {
        if (!audioCtxRef.current) {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 128;
          
          if (!sourceRef.current) {
            sourceRef.current = ctx.createMediaElementSource(audioRef.current!);
            sourceRef.current.connect(analyser);
            analyser.connect(ctx.destination);
          }
          
          audioCtxRef.current = ctx;
          analyserRef.current = analyser;
        }
        if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume();
      } catch (err) {
        console.warn('[VoxWorld] Visualizer disabled: CORS prevents audio node connection.');
      }
    };

    const draw = () => {
      if (!canvasRef.current || !analyserRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height;
        const gradient = ctx.createLinearGradient(0, height, 0, 0);
        gradient.addColorStop(0, 'rgba(14, 165, 233, 0.1)');
        gradient.addColorStop(0.5, 'rgba(14, 165, 233, 0.5)');
        gradient.addColorStop(1, 'rgba(14, 165, 233, 1)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        const r = barWidth / 2;
        // Fallback for browsers that don't support roundRect
        if (ctx.roundRect) {
          ctx.roundRect(x, height - barHeight, barWidth - 2, barHeight, [r, r, 0, 0]);
        } else {
          ctx.rect(x, height - barHeight, barWidth - 2, barHeight);
        }
        ctx.fill();
        x += barWidth + 1;
      }
      animationRef.current = requestAnimationFrame(draw);
    };

    // Only visualize if we are in a CORS-friendly stage
    if (isPlaying && !error && retryStage < 3) {
      initAudioContext();
      draw();
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    }

    return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
  }, [isPlaying, error, retryStage]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || error) return;
    try {
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      setError(null);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[VoxWorld] Playback failed:', err.message);
        throw err;
      }
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

    setError(null);
    setIsBuffering(true);
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    audio.pause();
    
    // NO-CORS stages allow playing streams that lack Access-Control headers
    if (retryStage >= 3) {
      audio.removeAttribute('crossOrigin');
    } else {
      audio.crossOrigin = "anonymous";
    }

    audio.src = '';
    
    // FIXED: Properly handle stream loading and completed switch logic for various audio sources
    const streamUrl = getUrlForStage(station, retryStage);

    if (streamUrl.includes('.m3u8') && Hls.isSupported() && retryStage === 0) {
      const hls = new Hls({
        enableWorker: true,
        xhrSetup: (xhr) => {
          if (retryStage < 3) xhr.withCredentials = false;
        }
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isPlaying) safePlay();
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn('[VoxWorld] HLS Fatal Error:', data.type);
          setRetryStage(prev => prev + 1);
        }
      });
      hlsRef.current = hls;
    } else {
      audio.src = streamUrl;
      audio.load();
      if (isPlaying) {
        safePlay().catch(() => {
          // If native playback fails, advance retry stage
          setRetryStage(prev => prev + 1);
        });
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [station, retryStage, isPlaying, getUrlForStage, safePlay]);

  // Handle errors and retries
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleError = () => {
      if (retryStage < 5) {
        setRetryStage(prev => prev + 1);
      } else {
        setIsBuffering(false);
        setError({
          message: 'This frequency is currently unreachable.',
          type: 'OFFLINE'
        });
      }
    };

    const handleCanPlay = () => {
      setIsBuffering(false);
      setError(null);
    };

    const handleWaiting = () => setIsBuffering(true);

    audio.addEventListener('error', handleError);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleWaiting);

    return () => {
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleWaiting);
    };
  }, [retryStage]);

  if (!station) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 h-24 glass border-t border-white/5 z-50 flex items-center px-4 md:px-8">
      <audio ref={audioRef} />
      
      <div className="flex items-center gap-4 w-full max-w-7xl mx-auto">
        {/* Station Identity */}
        <div className="flex items-center gap-4 min-w-0 md:w-1/3">
          <div className="w-12 h-12 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/5 relative">
            {station.favicon ? (
              <img src={station.favicon} alt="" className="w-full h-full object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')}/>
            ) : ( <ICONS.Radio /> )}
            {isBuffering && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white truncate text-sm">{station.name}</h3>
            <p className="text-[10px] text-slate-500 truncate">{station.country} • {station.codec} {station.bitrate ? `${station.bitrate}kbps` : ''}</p>
          </div>
        </div>

        {/* Playback Controls & Visualizer */}
        <div className="flex-1 flex flex-col items-center gap-1">
          <button 
            onClick={onTogglePlay}
            className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-11