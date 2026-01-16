
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
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [retryStage, setRetryStage] = useState(0); // 0: HTTPS upgrade, 1: Original Resolved, 2: Original Base

  const getUrlForStage = useCallback((s: Station, stage: number) => {
    const baseUrl = stage === 2 ? s.url : (s.url_resolved || s.url);
    if (stage === 0 && baseUrl.startsWith('http://') && window.location.protocol === 'https:') {
      return baseUrl.replace('http://', 'https://');
    }
    return baseUrl;
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const safePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !isPlaying || error) return;

    try {
      // If there's a pending play promise, we don't need to start a new one
      // unless the old one finished.
      playPromiseRef.current = audio.play();
      await playPromiseRef.current;
      setError(null);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Ignore AbortError as it is expected when we switch sources or pause
        console.debug('Playback interrupted by new request');
      } else {
        throw err; // Re-throw to be caught by the general handler
      }
    }
  }, [isPlaying, error]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;

    setError(null);
    setIsBuffering(true);
    
    // Reset audio state
    audio.pause();
    audio.src = '';
    audio.load();

    const streamUrl = getUrlForStage(station, retryStage);
    const isHls = streamUrl.includes('.m3u8') || 
                  station.codec === 'HLS' || 
                  station.hls === 1 ||
                  streamUrl.toLowerCase().includes('playlist');

    const handlePlaybackError = (e: any) => {
      // Extract useful info from the error event or object
      const mediaError = audio.error;
      const errorMsg = mediaError ? `Code ${mediaError.code}: ${mediaError.message || 'Stream error'}` : 'Unknown stream error';
      
      console.warn(`Playback Error (Stage ${retryStage}):`, errorMsg);
      
      // Automatic fallback logic
      if (retryStage < 2) {
        setRetryStage(prev => prev + 1);
        return;
      }

      let displayMsg = "Stream unreachable.";
      if (window.location.protocol === 'https:' && streamUrl.startsWith('http://')) {
        displayMsg = "Insecure stream blocked. Try the direct link.";
      } else if (mediaError?.code === 3) {
        displayMsg = "Decode error: Format not supported.";
      } else if (mediaError?.code === 4) {
        displayMsg = "Station offline or address changed.";
      }
      
      setError(displayMsg);
      setIsBuffering(false);
    };

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 2,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        if (isPlaying) safePlay().catch(handlePlaybackError);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            handlePlaybackError("HLS Fatal Error");
          }
        }
      });
    } else {
      audio.src = streamUrl;
      // Some streams require credentials/cors for metadata
      audio.crossOrigin = "anonymous";
      
      if (isPlaying) {
        safePlay().catch(handlePlaybackError);
      }
    }

    const onCanPlay = () => { setIsBuffering(false); };
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => { setIsBuffering(false); setError(null); };
    
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', handlePlaybackError);

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', handlePlaybackError);
      
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      audio.pause();
      audio.src = '';
      audio.removeAttribute('src');
      audio.load();
    };
  }, [station, isPlaying, retryStage, getUrlForStage, safePlay]);

  // Reset retries when station changes
  useEffect(() => { 
    setRetryStage(0);
    setError(null);
  }, [station?.stationuuid]);

  if (!station) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 glass border-t border-white/10 p-4 z-50 flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-bottom-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className="w-14 h-14 bg-slate-800 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center relative border border-white/5 shadow-inner">
          {station.favicon ? (
            <img src={station.favicon} alt="" className="w-full h-full object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')}/>
          ) : <ICONS.Radio />}
          {isBuffering && isPlaying && !error && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>
        <div className="overflow-hidden flex-1">
          <h3 className="text-sm font-bold truncate text-white leading-tight">{station.name}</h3>
          {error ? (
            <div className="flex flex-col gap-1 mt-1">
              <p className="text-[10px] text-rose-400 font-bold uppercase tracking-tight bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 w-fit">
                {error}
              </p>
              <a 
                href={station.url_resolved || station.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-[9px] text-sky-400 hover:text-sky-300 font-bold underline flex items-center gap-1"
              >
                Try Direct Stream <ICONS.Share />
              </a>
            </div>
          ) : (
            <p className="text-xs text-slate-400 truncate flex items-center gap-2 mt-0.5">
              <span className="opacity-50 font-medium">{station.country}</span>
              <span className="w-1 h-1 rounded-full bg-slate-700"></span>
              <span className="italic">{station.codec || 'Auto'} • {station.bitrate ? `${station.bitrate}kbps` : 'Variable'}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <button 
          onClick={onTogglePlay}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 shadow-xl ${
            error ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' : 'bg-sky-500 hover:bg-sky-400 text-white'
          }`}
          disabled={!!error}
        >
          {isPlaying && !error ? <ICONS.Pause /> : <ICONS.Play />}
        </button>
      </div>

      <div className="flex items-center gap-6 w-full md:w-auto max-w-xs bg-white/5 px-4 py-3 rounded-2xl border border-white/5">
        <div className="text-slate-500"><ICONS.ThumbsUp /></div>
        <input 
          type="range" min="0" max="1" step="0.01" 
          value={volume} 
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
      </div>

      <audio ref={audioRef} preload="auto" />
    </div>
  );
};

export default RadioPlayer;
