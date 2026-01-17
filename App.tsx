import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Station, GeminiRecommendation } from './types';
import { radioService, Country, StationSort } from './services/radioService';
import { geminiService } from './services/geminiService';
import { ICONS } from './constants';
import RadioPlayer from './components/RadioPlayer';
import WorldMap from './components/WorldMap';

const STORAGE_KEY = 'voxworld_favorites';
const VOTES_KEY = 'voxworld_user_votes';
const RECENT_KEY = 'voxworld_recently_played';
const PAGE_SIZE = 30;
const MAX_RECENT = 10;

const AI_STARTERS_CATEGORIES = [
  {
    title: "Mood & Vibe",
    prompts: [
      { text: "Rainy day jazz in Paris", icon: "🌧️" },
      { text: "80s cyberpunk synthwave", icon: "🌃" },
      { text: "Sun-drenched Bossa Nova from Rio", icon: "☀️" },
      { text: "Nordic ambient for winter nights", icon: "❄️" }
    ]
  },
  {
    title: "Activities",
    prompts: [
      { text: "Focus music for deep work", icon: "🧠" },
      { text: "High-energy Afrobeats for workout", icon: "🔥" },
      { text: "Lo-fi beats for reading", icon: "📖" },
      { text: "Tokyo midnight city pop for driving", icon: "🚗" }
    ]
  },
  {
    title: "Global Discovery",
    prompts: [
      { text: "Traditional folk from the Andes", icon: "🏔️" },
      { text: "Desert blues from West Africa", icon: "🌵" },
      { text: "Underground techno from Berlin", icon: "🔊" },
      { text: "Traditional Celtic harp melodies", icon: "🍀" }
    ]
  }
];

const DISCOVERY_TAGS = [
  { id: 'jazz', label: '🎷 Jazz', category: 'genre' },
  { id: 'lofi', label: '☕ Lofi', category: 'genre' },
  { id: 'techno', label: '🎧 Techno', category: 'genre' },
  { id: 'classical', label: '🎻 Classical', category: 'genre' },
  { id: 'rock', label: '🎸 Rock', category: 'genre' },
  { id: 'chill', label: '🌊 Chill', category: 'mood' },
  { id: 'energy', label: '⚡ Energy', category: 'mood' },
  { id: 'focus', label: '🧠 Focus', category: 'mood' },
  { id: 'melancholic', label: '🌧️ Gloomy', category: 'mood' },
  { id: 'happy', label: '☀️ Happy', category: 'mood' }
];

const FEATURED_COUNTRIES = [
  { name: 'Romania', code: 'RO' }, { name: 'UK', code: 'GB' }, { name: 'Germany', code: 'DE' },
  { name: 'France', code: 'FR' }, { name: 'Italy', code: 'IT' }, { name: 'Spain', code: 'ES' },
  { name: 'USA', code: 'US' }, { name: 'Canada', code: 'CA' }, { name: 'Mexico', code: 'MX' },
  { name: 'Brazil', code: 'BR' }, { name: 'Argentina', code: 'AR' }, { name: 'Japan', code: 'JP' },
  { name: 'India', code: 'IN' }, { name: 'Australia', code: 'AU' }, { name: 'South Africa', code: 'ZA' }
];

const App: React.FC = () => {
  const [stations, setStations] = useState<Station[]>([]);
  const [favorites, setFavorites] = useState<Station[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Station[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [currentStation, setCurrentStation] = useState<Station | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [recommendation, setRecommendation] = useState<GeminiRecommendation | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [currentFilterType, setCurrentFilterType] = useState<'top' | 'search' | 'country' | 'ai'>('top');
  const [sortBy, setSortBy] = useState<StationSort>('votes');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedFavs = localStorage.getItem(STORAGE_KEY);
    if (savedFavs) { try { setFavorites(JSON.parse(savedFavs)); } catch (e) { console.error(e); } }
    const savedVotes = localStorage.getItem(VOTES_KEY);
    if (savedVotes) { try { setVotedIds(new Set(JSON.parse(savedVotes))); } catch (e) { console.error(e); } }
    const savedRecent = localStorage.getItem(RECENT_KEY);
    if (savedRecent) { try { setRecentlyPlayed(JSON.parse(savedRecent)); } catch (e) { console.error(e); } }
    
    const fetchCountries = async () => {
      try {
        const data = await radioService.getCountries();
        setCountries(data);
      } catch (err) { console.error("Failed to fetch countries", err); }
    };
    fetchCountries();
  }, []);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(VOTES_KEY, JSON.stringify(Array.from(votedIds))); }, [votedIds]);
  useEffect(() => { localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyPlayed)); }, [recentlyPlayed]);

  const updateStationStats = useCallback((stationuuid: string, updates: Partial<Station>) => {
    const update = (list: Station[]) => list.map(s => s.stationuuid === stationuuid ? { ...s, ...updates } : s);
    setStations(prev => update(prev));
    setFavorites(prev => update(prev));
    setRecentlyPlayed(prev => update(prev));
  }, []);

  const fetchStations = useCallback(async (isAppend = false) => {
    const targetOffset = isAppend ? offset + PAGE_SIZE : 0;
    if (isAppend) setLoadingMore(true); else setLoading(true);

    try {
      let data: Station[] = [];
      const reverse = sortBy !== 'name' && sortBy !== 'country' && sortBy !== 'language';
      
      switch (currentFilterType) {
        case 'search': {
          const isTag = searchQuery.startsWith('#');
          const isCountrySearch = searchQuery.startsWith('@');
          const cleanVal = (isTag || isCountrySearch) ? searchQuery.slice(1) : searchQuery;
          data = await radioService.searchStations({ 
            name: (!isTag && !isCountrySearch) ? cleanVal : undefined,
            tag: isTag ? cleanVal : undefined,
            country: isCountrySearch ? cleanVal : undefined,
            limit: PAGE_SIZE, offset: targetOffset, order: sortBy, reverse: reverse
          });
          break;
        }
        case 'country':
          data = selectedCountry ? await radioService.getStationsByCountry(selectedCountry, PAGE_SIZE, targetOffset, sortBy) : [];
          break;
        case 'ai':
          data = recommendation ? await radioService.searchStations({ 
            tag: recommendation.genre, limit: PAGE_SIZE, offset: targetOffset, order: sortBy, reverse: reverse
          }) : [];
          break;
        default:
          if (sortBy === 'votes') {
            data = await radioService.getTopStations(PAGE_SIZE, targetOffset);
          } else {
            data = await radioService.searchStations({ limit: PAGE_SIZE, offset: targetOffset, order: sortBy, reverse: reverse });
          }
      }

      if (isAppend) {
        setStations(prev => [...prev, ...data]);
        setOffset(targetOffset);
      } else {
        setStations(data);
        setOffset(0);
      }
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) { console.error("Failed to fetch stations", err); } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [currentFilterType, searchQuery, selectedCountry, recommendation, offset, sortBy]);

  useEffect(() => { fetchStations(); }, [currentFilterType, selectedCountry, sortBy, fetchStations]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) { fetchStations(true); } },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, fetchStations]);

  const handleSearch = (e?: React.FormEvent, clearRecommendation = true) => {
    if (e) e.preventDefault();
    setSelectedCountry(null);
    if (clearRecommendation) setRecommendation(null);
    setCurrentFilterType('search');
  };

  const handleGlobalReset = () => {
    setSearchQuery('');
    setAiQuery('');
    setSelectedTags([]);
    setSelectedCountry(null);
    setRecommendation(null);
    setCurrentFilterType('top');
    setSortBy('votes');
  };

  const toggleTag = (tagLabel: string) => {
    setSelectedTags(prev => 
      prev.includes(tagLabel) ? prev.filter(t => t !== tagLabel) : [...prev, tagLabel]
    );
  };

  const handleAiDiscover = async (prompt?: string) => {
    const combinedQuery = prompt || [aiQuery, ...selectedTags].filter(Boolean).join(', ');
    if (!combinedQuery.trim()) return;
    
    setIsAiThinking(true);
    setAiQuery(prompt || aiQuery);
    setSelectedCountry(null);
    try {
      const rec = await geminiService.recommendStations(combinedQuery);
      if (rec) { setRecommendation(rec); setCurrentFilterType('ai'); }
    } catch (err) { console.error("AI Discovery failed", err); } finally { setIsAiThinking(false); }
  };

  const handleCountrySelect = (code: string) => {
    setSelectedCountry(code);
    setCurrentFilterType('country');
  };

  const toggleFavorite = (e: React.MouseEvent, station: Station) => {
    e.stopPropagation();
    setFavorites(prev => {
      const isFav = prev.some(s => s.stationuuid === station.stationuuid);
      if (isFav) return prev.filter(s => s.stationuuid !== station.stationuuid);
      return [...prev, station];
    });
  };

  const handleVote = async (e: React.MouseEvent, station: Station) => {
    e.stopPropagation();
    if (votedIds.has(station.stationuuid)) return;
    updateStationStats(station.stationuuid, { votes: station.votes + 1 });
    setVotedIds(prev => new Set(prev).add(station.stationuuid));
    const result = await radioService.voteForStation(station.stationuuid);
    if (!result.ok) {
      updateStationStats(station.stationuuid, { votes: station.votes });
      setVotedIds(prev => { const next = new Set(prev); next.delete(station.stationuuid); return next; });
    }
  };

  const handleShare = async (e: React.MouseEvent, station: Station) => {
    e.stopPropagation();
    const url = station.url_resolved || station.url;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(station.stationuuid);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) { console.error('Failed to copy text: ', err); }
  };

  const playStation = (station: Station) => {
    updateStationStats(station.stationuuid, { clickcount: (station.clickcount || 0) + 1 });
    if (currentStation?.stationuuid === station.stationuuid) {
      setIsPlaying(true);
    } else {
      setCurrentStation(station);
      setIsPlaying(true);
    }
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(s => s.stationuuid !== station.stationuuid);
      return [station, ...filtered].slice(0, MAX_RECENT);
    });
  };

  const togglePlay = useCallback(() => setIsPlaying(prev => !prev), []);
  const favoriteIds = useMemo(() => new Set(favorites.map(s => s.stationuuid)), [favorites]);

  const renderStationCard = (station: Station) => {
    const isFav = favoriteIds.has(station.stationuuid);
    const hasVoted = votedIds.has(station.stationuuid);
    const isCurrent = currentStation?.stationuuid === station.stationuuid;
    const isCopied = copiedId === station.stationuuid;

    return (
      <div 
        key={station.stationuuid}
        onClick={() => playStation(station)}
        className={`group relative p-4 rounded-2xl transition-all cursor-pointer border animate-in fade-in slide-in-from-bottom-2 ${
          isCurrent 
            ? 'bg-sky-500/10 border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.1)]' 
            : 'bg-slate-900/50 border-white/5 hover:bg-slate-800/80 hover:border-white/10'
        }`}
      >
        <div className="flex gap-4">
          <div className="w-14 h-14 bg-slate-800 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/5 relative">
            {station.favicon ? (
              <img src={station.favicon} alt={station.name} className="w-full h-full object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')}/>
            ) : ( <ICONS.Radio /> )}
            {isCurrent && isPlaying ? (
              <div className="absolute inset-0 bg-sky-500/40 flex items-center justify-center">
                <div className="flex gap-0.5 items-end h-4">
                  <div className="w-1 bg-white animate-[bounce_0.6s_infinite] h-2"></div>
                  <div className="w-1 bg-white animate-[bounce_0.8s_infinite] h-4"></div>
                  <div className="w-1 bg-white animate-[bounce_0.7s_infinite] h-3"></div>
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                <ICONS.Play />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate text-white">{station.name}</h4>
            <p className="text-xs text-slate-500 truncate mb-1">{station.country} • {station.language}</p>
            <div className="flex flex-wrap gap-1 items-center">
              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 rounded-full text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1">
                {station.votes.toLocaleString()} <span className="text-[8px] opacity-60">VOTES</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 bg-slate-800 rounded-full text-slate-400 font-bold border border-white/5 flex items-center gap-1">
                {(station.clickcount || 0).toLocaleString()} <span className="text-[8px] opacity-60">CLICKS</span>
              </span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button onClick={(e) => toggleFavorite(e, station)} className={`p-2 rounded-full transition-colors ${isFav ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`} title="Add to Favorites">
              {isFav ? <ICONS.StarFilled /> : <ICONS.Star />}
            </button>
            <button onClick={(e) => handleVote(e, station)} disabled={hasVoted} className={`p-2 rounded-full transition-all ${hasVoted ? 'text-emerald-400 scale-110 cursor-default bg-emerald-500/10' : 'text-slate-600 hover:text-emerald-400 hover:bg-white/5'}`} title={hasVoted ? "You've voted for this station" : "Vote Up"}>
              <ICONS.ThumbsUp />
            </button>
            <button onClick={(e) => handleShare(e, station)} className={`p-2 rounded-full transition-all relative ${isCopied ? 'text-sky-400 bg-sky-500/10' : 'text-slate-600 hover:text-sky-400 hover:bg-white/5'}`} title="Share Link">
              {isCopied ? <ICONS.Check /> : <ICONS.Share />}
              {isCopied && <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-sky-500 text-white text-[10px] font-bold px-2 py-1 rounded-md shadow-lg animate-in fade-in zoom-in-50 duration-200">COPIED!</span>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const getFlagEmoji = (countryCode: string) => countryCode.toUpperCase().replace(/./g, char => String.fromCodePoint(char.charCodeAt(0) + 127397));

  const sortOptions: { label: string; value: StationSort }[] = [
    { label: 'Popularity', value: 'votes' }, 
    { label: 'Quality', value: 'bitrate' },
    { label: 'Trending', value: 'clickcount' }, 
    { label: 'A-Z', value: 'name' },
    { label: 'Country', value: 'country' },
    { label: 'Language', value: 'language' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden">
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 glass shrink-0 z-30">
        <div className="flex items-center gap-2 cursor-pointer" onClick={handleGlobalReset}>
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <ICONS.Radio />
          </div>
          <h1 className="text-xl font-outfit font-bold tracking-tight bg-gradient-to-r from-white to-sky-400 bg-clip-text text-transparent">VoxWorld</h1>
        </div>
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <form onSubmit={handleSearch} className="relative w-full">
            <input type="text" placeholder="Search station, #genre, or @country..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-10 bg-slate-900 border border-white/5 rounded-full pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"/>
            <div className="absolute left-3 top-2.5 text-slate-500"><ICONS.Search /></div>
          </form>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleGlobalReset} className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-all ${currentFilterType === 'top' ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20' : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'}`}>
            <ICONS.World /><span>GLOBAL</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:flex w-80 border-r border-white/5 flex-col p-6 overflow-y-auto shrink-0 bg-slate-950/30 no-scrollbar">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="text-sky-400"><ICONS.Sparkles /></div>
              <h2 className="font-outfit font-semibold text-white">AI Discovery Lab</h2>
            </div>
            
            <div className="space-y-6">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {DISCOVERY_TAGS.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.label)}
                    className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${
                      selectedTags.includes(tag.label)
                        ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20 scale-105'
                        : 'bg-white/5 border-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>

              <div className="relative group">
                <textarea 
                  value={aiQuery} 
                  onChange={(e) => setAiQuery(e.target.value)} 
                  placeholder="Describe your destination (e.g., 'reading in a Tokyo cafe')..." 
                  className="w-full bg-slate-900 border border-white/5 rounded-2xl p-4 text-sm h-28 focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none transition-all placeholder:text-slate-600"
                />
                <button 
                  onClick={() => handleAiDiscover()} 
                  disabled={isAiThinking || (aiQuery.trim().length === 0 && selectedTags.length === 0)} 
                  className="absolute right-3 bottom-3 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg"
                >
                  {isAiThinking ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <ICONS.Sparkles />}
                </button>
              </div>

              {/* Enhanced AI Starters UI */}
              <div className="space-y-4">
                {AI_STARTERS_CATEGORIES.map((category) => (
                  <div key={category.title}>
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">{category.title}</h3>
                    <div className="grid grid-cols-1 gap-1.5">
                      {category.prompts.map((prompt) => (
                        <button
                          key={prompt.text}
                          onClick={() => handleAiDiscover(prompt.text)}
                          className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-sky-500/10 hover:border-sky-500/20 hover:text-sky-400 transition-all text-left text-[11px] font-medium group"
                        >
                          <span className="text-base group-hover:scale-125 transition-transform">{prompt.icon}</span>
                          <span className="truncate">{prompt.text}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => {
                    const allPrompts = AI_STARTERS_CATEGORIES.flatMap(c => c.prompts);
                    const randomPrompt = allPrompts[Math.floor(Math.random() * allPrompts.length)].text;
                    handleAiDiscover(randomPrompt);
                  }}
                  className="w-full py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-sky-500/50 hover:bg-sky-500/5 text-slate-500 hover:text-sky-400 transition-all text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2"
                >
                  <ICONS.Sparkles /> <span>Surprise Me</span>
                </button>
              </div>
            </div>
          </div>

          {recommendation && (
            <div className="p-5 bg-gradient-to-br from-sky-500/20 to-indigo-500/10 rounded-3xl border border-sky-500/20 animate-in fade-in slide-in-from-left-4 mb-8 group cursor-pointer" onClick={() => setCurrentFilterType('ai')}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sky-300 font-bold text-xs uppercase tracking-[0.2em]">{recommendation.genre}</h3>
                <div className="text-sky-400 group-hover:scale-125 transition-transform"><ICONS.Sparkles /></div>
              </div>
              <p className="text-[11px] text-slate-300 mb-4 leading-relaxed font-medium">{recommendation.description}</p>
              <div className="flex flex-wrap gap-2">
                {recommendation.suggestedCountries.map(c => (
                  <div key={c} className="flex items-center bg-sky-500/30 rounded-full border border-white/10 overflow-hidden hover:bg-sky-500/50 transition-all group/chip">
                    <span className="text-[9px] px-2.5 py-1 text-white font-bold">{c}</span>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSearchQuery(`@${c}`); 
                        setSelectedCountry(null);
                        setCurrentFilterType('search');
                      }} 
                      className="p-1 px-2 border-l border-white/10 bg-white/5 hover:bg-white/20 text-white/70 hover:text-white transition-all flex items-center justify-center"
                      title={`Filter by ${c}`}
                    >
                      <div className="scale-75"><ICONS.Search /></div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {recentlyPlayed.length > 0 && (
            <div className="mb-8 border-t border-white/5 pt-8">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">History</h3>
              <div className="flex flex-col gap-2">
                {recentlyPlayed.map(station => (
                  <button key={`recent-${station.stationuuid}`} onClick={() => playStation(station)} className={`flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left ${currentStation?.stationuuid === station.stationuuid ? 'border-sky-500/30 bg-sky-500/5' : ''}`}>
                    <div className="w-8 h-8 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {station.favicon ? <img src={station.favicon} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => e.currentTarget.src = ''}/> : <ICONS.Radio />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-200 truncate">{station.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">{station.country}</div>
                    </div>
                    {currentStation?.stationuuid === station.stationuuid && isPlaying && <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse shrink-0"></div>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-8 border-t border-white/5 pt-8">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Featured</h3>
            <div className="grid grid-cols-2 gap-2">
              {FEATURED_COUNTRIES.map(c => (
                <button key={c.code} onClick={() => handleCountrySelect(c.code)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[10px] font-bold transition-all ${selectedCountry === c.code ? 'bg-sky-500/20 text-sky-400 border border-sky-500/20' : 'bg-slate-900 border border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  <span className="text-sm leading-none">{getFlagEmoji(c.code)}</span><span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex-1 overflow-y-auto p-4 md:p-8 relative custom-scrollbar">
          <div className="mb-10">
            <WorldMap countries={countries} onSelectCountry={handleCountrySelect} selectedCountry={selectedCountry} />
          </div>
          {favorites.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center gap-2 mb-6"><div className="text-yellow-400"><ICONS.StarFilled /></div><h2 className="text-xl font-outfit font-bold text-white">Your Collection</h2></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">{favorites.map(station => renderStationCard(station))}</div>
            </div>
          )}
          <div className="mb-24">
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-outfit font-bold text-white">
                    {selectedCountry ? `Stations in ${countries.find(c => c.iso_3166_1 === selectedCountry)?.name || selectedCountry}` : searchQuery ? `Results for "${searchQuery}"` : recommendation ? `AI Recommended: ${recommendation.genre}` : 'Global Top Frequencies'}
                  </h2>
                  {(selectedCountry || searchQuery || recommendation) && <button onClick={handleGlobalReset} className="text-[10px] text-slate-500 hover:text-sky-400 font-bold uppercase tracking-[0.2em] transition-colors"> Reset Filters </button>}
                </div>
                {loading && <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>}
              </div>
              <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-2xl border border-white/5 w-fit max-w-full overflow-x-auto no-scrollbar">
                {sortOptions.map((opt) => (
                  <button key={opt.value} onClick={() => setSortBy(opt.value)} className={`px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${sortBy === opt.value ? 'bg-sky-500 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>{opt.label}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {stations.map((station) => renderStationCard(station))}
              {!loading && stations.length === 0 && (
                <div className="col-span-full py-24 text-center text-slate-500 flex flex-col items-center gap-4">
                  <div className="p-4 bg-slate-900 rounded-full border border-white/5 opacity-50"><ICONS.Radio /></div>
                  <p className="font-medium">No frequencies found on this band.</p>
                  <button onClick={handleGlobalReset} className="text-sky-500 font-bold hover:underline">Return to Global Top</button>
                </div>
              )}
            </div>
            {hasMore && (
              <div ref={observerTarget} className="w-full h-20 flex items-center justify-center mt-8">
                {(loading || loadingMore) && <div className="flex items-center gap-3 text-sky-500 font-bold text-[10px] tracking-[0.3em] animate-pulse">TUNING TO MORE STATIONS...</div>}
              </div>
            )}
          </div>
        </section>
      </main>
      <RadioPlayer station={currentStation} isPlaying={isPlaying} onTogglePlay={togglePlay} />
    </div>
  );
};

export default App;
