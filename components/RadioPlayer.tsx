
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
  const hlsRef = useRef<Hls | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  // Helper to ensure HTTPS where possible to avoid mixed content issues
  const getPreferredUrl = useCallback((url: string) => {
    if (window.location.protocol === 'https:' && url.startsWith('http://')) {
      return url.replace('http://', 'https://');
    }
    return url;
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;

    setError(null);
    setIsBuffering(true);

    const rawUrl = station.url_resolved || station.url;
    const streamUrl = getPreferredUrl(rawUrl);
    const isHls = streamUrl.includes('.m3u8') || station.codec === 'HLS' || station.hls === 1;

    const handlePlaybackError = (err: any) => {
      console.error("Playback failed", err);
      // Detailed error messages based on standard MediaError codes if available
      if (audio.error) {
        switch (audio.error.code) {
          case 1: setError("Playback aborted."); break;
          case 2: setError("Network error. Check your connection."); break;
          case 3: setError("Audio decoding failed. Unsupported format."); break;
          case 4: setError("Source not supported or blocked (Mixed Content)."); break;
          default: setError("Unknown playback error.");
        }
      } else {
        setError("Station unreachable or unsupported stream format.");
      }
      setIsBuffering(false);
    };

    // Cleanup previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
        // Proactive error recovery
        manifestLoadingRetryDelay: 1000,
        levelLoadingRetryDelay: 1000,
      });
      hlsRef.current = hls;
      
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        if (isPlaying) {
          audio.play().catch(handlePlaybackError);
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn("HLS Network error, attempting recovery...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn("HLS Media error, attempting recovery...");
              hls.recoverMediaError();
              break;
            default:
              setError("Stream format incompatible or server unreachable.");
              hls.destroy();
              setIsBuffering(false);
              break;
          }
        }
      });
    } else {
      // Regular stream (MP3, AAC) or native HLS (Safari/iOS)
      audio.src = streamUrl;
      // Proactive load to check for source validity
      audio.load();
      
      if (isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(handlePlaybackError);
        }
      }
    }

    const onCanPlay = () => {
      setError(null);
      setIsBuffering(false);
    };
    
    const onWaiting = () => setIsBuffering(true);
    
    const onNativeError = (e: any) => {
      console.error("Native Audio Error:", audio.error);
      handlePlaybackError(e);
    };

    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onNativeError);

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onNativeError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      audio.src = '';
    };
  }, [station, isPlaying, getPreferredUrl]);

  // Handle play/pause toggle separately to avoid re-initializing the source
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station || error) return;

    if (isPlaying) {
      if (audio.paused) {
        audio.play().catch(() => {
          // Re-pause if play failed (e.g. user interaction required)
        });
      }
    } else {
      audio.pause();
    }
  }, [isPlaying, station, error]);

  if (!station) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/10 p-4 z-50 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className="w-12 h-12 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center relative">
          {station.favicon ? (
            <img 
              src={station.favicon} 
              alt={station.name} 
              className="w-full h-full object-contain" 
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          ) : (
            <ICONS.Radio />
          )}
          {isBuffering && isPlaying && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <div className="overflow-hidden">
          <h3 className="text-sm font-semibold truncate text-white">{station.name}</h3>
          {error ? (
            <p className="text-xs text-rose-400 font-medium truncate">{error}</p>
          ) : (
            <p className="text-xs text-slate-400 truncate">{station.country} • {station.tags || 'General'}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button 
          onClick={onTogglePlay}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 glow ${
            error ? 'bg-rose-900/40 text-rose-300' : 'bg-sky-500 hover:bg-sky-400 text-white'
          }`}
          title={error ? "Try another station" : isPlaying ? "Pause" : "Play"}
        >
          {isPlaying && !error ? <ICONS.Pause /> : <ICONS.Play />}
        </button>
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto max-w-xs">
        <span className="text-xs text-slate-400 uppercase tracking-tighter font-medium">Volume</span>
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          value={volume} 
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
      </div>

      <audio ref={audioRef} crossOrigin="anonymous" preload="auto" />
    </div>
  );
};

export default RadioPlayer;
