
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

// Expanded to cover over 120 major countries/territories across all regions
const FEATURED_COUNTRIES = [
  // Europe
  { name: 'Romania', code: 'RO' }, { name: 'United Kingdom', code: 'GB' }, { name: 'Germany', code: 'DE' },
  { name: 'France', code: 'FR' }, { name: 'Italy', code: 'IT' }, { name: 'Spain', code: 'ES' },
  { name: 'Netherlands', code: 'NL' }, { name: 'Sweden', code: 'SE' }, { name: 'Switzerland', code: 'CH' },
  { name: 'Poland', code: 'PL' }, { name: 'Greece', code: 'GR' }, { name: 'Portugal', code: 'PT' },
  { name: 'Norway', code: 'NO' }, { name: 'Denmark', code: 'DK' }, { name: 'Finland', code: 'FI' },
  { name: 'Austria', code: 'AT' }, { name: 'Belgium', code: 'BE' }, { name: 'Ireland', code: 'IE' },
  { name: 'Czechia', code: 'CZ' }, { name: 'Hungary', code: 'HU' }, { name: 'Ukraine', code: 'UA' },
  // Americas
  { name: 'USA', code: 'US' }, { name: 'Canada', code: 'CA' }, { name: 'Mexico', code: 'MX' },
  { name: 'Brazil', code: 'BR' }, { name: 'Argentina', code: 'AR' }, { name: 'Colombia', code: 'CO' },
  { name: 'Chile', code: 'CL' }, { name: 'Peru', code: 'PE' }, { name: 'Venezuela', code: 'VE' },
  { name: 'Ecuador', code: 'EC' }, { name: 'Uruguay', code: 'UY' }, { name: 'Cuba', code: 'CU' },
  { name: 'Jamaica', code: 'JM' }, { name: 'Costa Rica', code: 'CR' }, { name: 'Panama', code: 'PA' },
  // Asia & Middle East
  { name: 'Japan', code: 'JP' }, { name: 'China', code: 'CN' }, { name: 'India', code: 'IN' },
  { name: 'South Korea', code: 'KR' }, { name: 'Thailand', code: 'TH' }, { name: 'Vietnam', code: 'VN' },
  { name: 'Indonesia', code: 'ID' }, { name: 'Philippines', code: 'PH' }, { name: 'Malaysia', code: 'MY' },
  { name: 'Singapore', code: 'SG' }, { name: 'Turkey', code: 'TR' }, { name: 'Israel', code: 'IL' },
  { name: 'Saudi Arabia', code: 'SA' }, { name: 'UAE', code: 'AE' }, { name: 'Iran', code: 'IR' },
  { name: 'Pakistan', code: 'PK' }, { name: 'Kazakhstan', code: 'KZ' }, { name: 'Uzbekistan', code: 'UZ' },
  // Africa
  { name: 'Egypt', code: 'EG' }, { name: 'South Africa', code: 'ZA' }, { name: 'Nigeria', code: 'NG' },
  { name: 'Kenya', code: 'KE' }, { name: 'Morocco', code: 'MA' }, { name: 'Algeria', code: 'DZ' },
  { name: 'Ethiopia', code: 'ET' }, { name: 'Ghana', code: 'GH' }, { name: 'Tanzania', code: 'TZ' },
  { name: 'Uganda', code: 'UG' }, { name: 'Senegal', code: 'SN' }, { name: 'Tunisia', code: 'TN' },
  // Oceania
  { name: 'Australia', code: 'AU' }, { name: 'New Zealand', code: 'NZ' }, { name: 'Fiji', code: 'FJ' },
  { name: 'Papua New Guinea', code: 'PG' }, { name: 'Solomon Islands', code: 'SB' }
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
  const [recommendation, setRecommendation] = useState<GeminiRecommendation | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [currentFilterType, setCurrentFilterType] = useState<'top' | 'search' | 'country' | 'ai'>('top');
  const [sortBy, setSortBy] = useState<StationSort>('votes');

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

  const fetchStations = useCallback(async (isAppend = false) => {
    const targetOffset = isAppend ? offset + PAGE_SIZE : 0;
    if (isAppend) setLoadingMore(true); else setLoading(true);

    try {
      let data: Station[] = [];
      const reverse = sortBy !== 'name';
      
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

  useEffect(() => { fetchStations(); }, [currentFilterType, selectedCountry, sortBy]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) { fetchStations(true); } },
      { threshold: 0.1 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, fetchStations]);

  const handleSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSelectedCountry(null);
    setCurrentFilterType('search');
  };

  const handleGlobalReset = () => {
    setSearchQuery('');
    setSelectedCountry(null);
    setRecommendation(null);
    setCurrentFilterType('top');
    setSortBy('votes');
  };

  const handleAiDiscover = async () => {
    if (!aiQuery.trim()) return;
    setLoading(true);
    setSelectedCountry(null);
    try {
      const rec = await geminiService.recommendStations(aiQuery);
      if (rec) { setRecommendation(rec); setCurrentFilterType('ai'); }
    } catch (err) { console.error("AI Discovery failed", err); } finally { setLoading(false); }
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
    const result = await radioService.voteForStation(station.stationuuid);
    if (result.ok) {
      setVotedIds(prev => new Set(prev).add(station.stationuuid));
      const updateList = (list: Station[]) => list.map(s => s.stationuuid === station.stationuuid ? { ...s, votes: s.votes + 1 } : s);
      setStations(updateList);
      setFavorites(updateList);
      setRecentlyPlayed(updateList);
    }
  };

  const playStation = (station: Station) => {
    setCurrentStation(station);
    setIsPlaying(true);
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
          <div className="w-14 h-14 bg-slate-800 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden border border-white/5">
            {station.favicon ? (
              <img src={station.favicon} alt={station.name} className="w-full h-full object-contain p-1" onError={(e) => (e.currentTarget.style.display = 'none')}/>
            ) : ( <ICONS.Radio /> )}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate text-white">{station.name}</h4>
            <p className="text-xs text-slate-500 truncate mb-1">{station.country} • {station.language}</p>
            <div className="flex flex-wrap gap-1 items-center">
              {station.bitrate > 0 && (
                <span className="text-[10px] px-2 py-0.5 bg-sky-500/10 rounded-full text-sky-400 font-bold border border-sky-500/20">{station.bitrate} kbps</span>
              )}
              <span className="text-[10px] px-2 py-0.5 bg-emerald-500/10 rounded-full text-emerald-400 font-bold border border-emerald-500/20 flex items-center gap-1">
                {station.votes.toLocaleString()} <span className="text-[8px] opacity-60">VOTES</span>
              </span>
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-1">
            <button 
              onClick={(e) => toggleFavorite(e, station)}
              className={`p-2 rounded-full transition-colors ${isFav ? 'text-yellow-400' : 'text-slate-600 hover:text-slate-400'}`}
              title="Add to Favorites"
            >
              {isFav ? <ICONS.StarFilled /> : <ICONS.Star />}
            </button>
            <button 
              onClick={(e) => handleVote(e, station)}
              disabled={hasVoted}
              className={`p-2 rounded-full transition-all ${hasVoted ? 'text-emerald-400 scale-110 cursor-default bg-emerald-500/10' : 'text-slate-600 hover:text-emerald-400 hover:bg-white/5'}`}
              title={hasVoted ? "You've voted for this station" : "Vote Up"}
            >
              <ICONS.ThumbsUp />
            </button>
            <div className={`opacity-0 group-hover:opacity-100 transition-opacity mt-1 ${isCurrent ? 'opacity-100' : ''}`}>
              <div className="w-7 h-7 rounded-full bg-sky-500 flex items-center justify-center text-white shadow-lg">
                {isCurrent && isPlaying ? <ICONS.Pause /> : <ICONS.Play />}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getFlagEmoji = (countryCode: string) => {
    return countryCode.toUpperCase().replace(/./g, char => 
      String.fromCodePoint(char.charCodeAt(0) + 127397)
    );
  };

  const sortOptions: { label: string; value: StationSort }[] = [
    { label: 'Popularity', value: 'votes' },
    { label: 'Quality', value: 'bitrate' },
    { label: 'Trending', value: 'clickcount' },
    { label: 'Country', value: 'country' },
    { label: 'A-Z', value: 'name' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-200 overflow-hidden">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 glass shrink-0 z-30">
        <div className="flex items-center gap-2" onClick={handleGlobalReset} style={{cursor: 'pointer'}}>
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <ICONS.Radio />
          </div>
          <h1 className="text-xl font-outfit font-bold tracking-tight bg-gradient-to-r from-white to-sky-400 bg-clip-text text-transparent">VoxWorld</h1>
        </div>
        
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <form onSubmit={handleSearch} className="relative w-full">
            <input 
              type="text" 
              placeholder="Search station, #genre, or @country..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-slate-900 border border-white/5 rounded-full pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition-all"
            />
            <div className="absolute left-3 top-2.5 text-slate-500">
              <ICONS.Search />
            </div>
          </form>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={handleGlobalReset}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold transition-all ${
              currentFilterType === 'top' 
              ? 'bg-sky-500 border-sky-400 text-white shadow-lg shadow-sky-500/20' 
              : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
            }`}
          >
            <ICONS.World />
            <span>GLOBAL</span>
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="hidden lg:flex w-80 border-r border-white/5 flex-col p-6 overflow-y-auto shrink-0 bg-slate-950/30 no-scrollbar">
          {/* Gemini Discovery */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="text-sky-400"><ICONS.Sparkles /></div>
              <h2 className="font-outfit font-semibold">Gemini Discovery</h2>
            </div>
            <div className="relative">
              <textarea 
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Describe a mood or a vibe..."
                className="w-full bg-slate-900 border border-white/5 rounded-xl p-3 text-sm h-24 focus:outline-none focus:ring-2 focus:ring-sky-500/30 resize-none"
              />
              <button 
                onClick={handleAiDiscover}
                disabled={loading || !aiQuery.trim()}
                className="absolute right-2 bottom-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1 rounded-lg text-xs font-semibold transition-all"
              >
                Find
              </button>
            </div>
          </div>

          {recommendation && (
            <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/20 animate-in fade-in slide-in-from-left-4 mb-8">
              <h3 className="text-sky-300 font-semibold text-sm mb-2 uppercase tracking-wider">{recommendation.genre}</h3>
              <p className="text-xs text-slate-300 mb-3 leading-relaxed">{recommendation.description}</p>
              <div className="flex flex-wrap gap-1">
                {recommendation.suggestedCountries.map(c => (
                  <button key={c} onClick={() => { setSearchQuery(`@${c}`); handleSearch(); }} className="text-[10px] bg-sky-500/20 px-2 py-0.5 rounded-full text-sky-400 border border-sky-500/10 hover:bg-sky-500/40 transition-colors"> {c} </button>
                ))}
              </div>
            </div>
          )}

          {/* Recently Played */}
          {recentlyPlayed.length > 0 && (
            <div className="mb-8 border-t border-white/5 pt-8">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Recently Played</h3>
              <div className="flex flex-col gap-2">
                {recentlyPlayed.map(station => (
                  <button
                    key={`recent-${station.stationuuid}`}
                    onClick={() => playStation(station)}
                    className="flex items-center gap-3 p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all text-left"
                  >
                    <div className="w-8 h-8 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                      {station.favicon ? (
                        <img src={station.favicon} alt="" className="w-full h-full object-contain p-0.5" onError={(e) => e.currentTarget.src = ''}/>
                      ) : ( <ICONS.Radio /> )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-200 truncate">{station.name}</div>
                      <div className="text-[9px] text-slate-500 truncate">{station.country}</div>
                    </div>
                    {currentStation?.stationuuid === station.stationuuid && isPlaying && (
                      <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0"></div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Featured Regions Shortcut (Expanded) */}
          <div className="mb-8 border-t border-white/5 pt-8">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Quick Travel</h3>
            <div className="grid grid-cols-2 gap-2">
              {FEATURED_COUNTRIES.map(c => (
                <button 
                  key={c.code}
                  onClick={() => handleCountrySelect(c.code)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
                    selectedCountry === c.code 
                    ? 'bg-sky-500/20 text-sky-400 border border-sky-500/20' 
                    : 'bg-slate-900 border border-white/5 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="text-base leading-none">{getFlagEmoji(c.code)}</span>
                  <span className="truncate tracking-tight">{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-white/5 pt-8">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Trending Tags</h3>
            <div className="flex flex-wrap gap-2">
              {['Lofi', 'Synthwave', 'Jazz', 'Techno', 'News', 'Classic', 'EDM', 'Talk', 'Rock', 'Pop'].map(tag => (
                <button key={tag} onClick={() => { setSearchQuery(`#${tag}`); handleSearch(); }} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 text-xs hover:bg-slate-800 transition-colors"> #{tag} </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <section className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar relative">
          <div className="mb-10">
            <WorldMap countries={countries} onSelectCountry={handleCountrySelect} selectedCountry={selectedCountry} />
          </div>

          {favorites.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <div className="text-yellow-400"><ICONS.StarFilled /></div>
                <h2 className="text-xl font-outfit font-bold">Your Favorites</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {favorites.map(station => renderStationCard(station))}
              </div>
            </div>
          )}

          <div className="mb-24">
            <div className="flex flex-col gap-6 mb-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-outfit font-bold">
                    {selectedCountry 
                      ? `Stations in ${countries.find(c => c.iso_3166_1 === selectedCountry)?.name || selectedCountry}` 
                      : searchQuery 
                        ? `Results for "${searchQuery}"`
                        : recommendation 
                          ? `AI Recommended: ${recommendation.genre}`
                          : 'Global Discoveries'}
                  </h2>
                  {(selectedCountry || searchQuery || recommendation) && (
                    <button onClick={handleGlobalReset} className="text-xs text-slate-500 hover:text-sky-400 font-bold uppercase tracking-widest transition-colors"> Reset Filter </button>
                  )}
                </div>
                {loading && <div className="animate-spin text-sky-500"><ICONS.World /></div>}
              </div>

              <div className="flex items-center gap-4 bg-slate-900/50 p-1.5 rounded-2xl border border-white/5 w-fit">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 px-3">Sort by</span>
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                  {sortOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                        sortBy === opt.value ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {stations.map((station) => renderStationCard(station))}
              {!loading && stations.length === 0 && (
                <div className="col-span-full py-24 text-center text-slate-500 flex flex-col items-center gap-4">
                  <div className="p-4 bg-slate-900 rounded-full border border-white/5 opacity-50"><ICONS.Radio /></div>
                  <p className="font-medium">No stations found matching your criteria.</p>
                  <button onClick={handleGlobalReset} className="text-sky-500 font-bold hover:underline">Explore Global Top Stations</button>
                </div>
              )}
            </div>

            {hasMore && (
              <div ref={observerTarget} className="w-full h-20 flex items-center justify-center mt-8">
                {(loading || loadingMore) && (
                  <div className="flex items-center gap-3 text-sky-500 font-bold text-sm tracking-widest animate-pulse">
                    <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin"></div>
                    FETCHING MORE FREQUENCIES...
                  </div>
                )}
              </div>
            )}
            
            {!hasMore && stations.length > 0 && (
              <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-[0.2em]">
                END OF THE DIAL • ALL FREQUENCIES DISCOVERED
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
