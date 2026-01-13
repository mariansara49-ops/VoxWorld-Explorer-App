
import React, { useState, useMemo } from 'react';
import { Country } from '../services/radioService';
import { ICONS } from '../constants';

interface WorldMapProps {
  countries: Country[];
  onSelectCountry: (code: string) => void;
  selectedCountry: string | null;
}

const getFlagEmoji = (countryCode: string) => {
  if (!countryCode) return '';
  return countryCode.toUpperCase().replace(/./g, char => 
    String.fromCodePoint(char.charCodeAt(0) + 127397)
  );
};

const WorldMap: React.FC<WorldMapProps> = ({ countries, onSelectCountry, selectedCountry }) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'count' | 'name'>('count');

  const filteredCountries = useMemo(() => {
    let result = countries.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase()) || 
      c.iso_3166_1.toLowerCase().includes(search.toLowerCase())
    );

    if (sortBy === 'count') {
      result.sort((a, b) => b.stationcount - a.stationcount);
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [countries, search, sortBy]);

  const totalStations = useMemo(() => 
    countries.reduce((acc, curr) => acc + curr.stationcount, 0), 
  [countries]);

  return (
    <div className="w-full bg-slate-900/40 rounded-3xl overflow-hidden border border-white/5 flex flex-col md:flex-row h-[600px] shadow-2xl">
      {/* Map/Visual Side */}
      <div className="hidden md:flex flex-1 items-center justify-center relative bg-[#020617] overflow-hidden group">
        <div className="absolute inset-0 opacity-30 pointer-events-none transition-opacity group-hover:opacity-40">
          <div className="w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-500/30 via-transparent to-transparent"></div>
        </div>
        
        <div className="text-center z-10 p-8">
          <div className="mb-8 inline-block p-6 bg-sky-500/10 rounded-full text-sky-400 animate-pulse relative">
            <div className="absolute inset-0 bg-sky-500/20 rounded-full blur-xl scale-125"></div>
            <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" className="relative z-10">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <h2 className="text-3xl font-outfit font-extrabold mb-3 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">Global Frequency Map</h2>
          <p className="text-slate-400 text-sm max-w-[320px] mx-auto leading-relaxed mb-6">
            Access <span className="text-sky-400 font-bold">{totalStations.toLocaleString()}</span> live broadcasts from <span className="text-sky-400 font-bold">{countries.length}</span> countries around the planet.
          </p>
          <div className="flex justify-center gap-4 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-sky-500"></div> FM / AM</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Digital</span>
            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Community</span>
          </div>
        </div>

        {/* Background Decorative Grid */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="gridLarge" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#gridLarge)" />
          </svg>
        </div>
      </div>

      {/* Country List Side */}
      <div className="w-full md:w-[400px] glass border-l border-white/5 flex flex-col h-full overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/5 bg-slate-900/40">
          <div className="relative mb-4">
            <input 
              type="text" 
              placeholder="Search by country name or code..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 bg-slate-950 border border-white/10 rounded-2xl pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30 transition-all placeholder:text-slate-600"
            />
            <div className="absolute left-4 top-3.5 text-slate-500">
              <ICONS.Search />
            </div>
          </div>
          
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-500 font-semibold">{filteredCountries.length} Results</span>
            <div className="flex gap-3">
              <button 
                onClick={() => setSortBy('count')}
                className={`transition-colors font-bold ${sortBy === 'count' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                STATIONS
              </button>
              <button 
                onClick={() => setSortBy('name')}
                className={`transition-colors font-bold ${sortBy === 'name' ? 'text-sky-400' : 'text-slate-600 hover:text-slate-400'}`}
              >
                A-Z
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
          <div className="grid grid-cols-1 gap-2">
            {filteredCountries.map(country => (
              <button
                key={country.iso_3166_1}
                onClick={() => onSelectCountry(country.iso_3166_1)}
                className={`flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all group relative overflow-hidden ${
                  selectedCountry === country.iso_3166_1 
                  ? 'bg-sky-500/20 text-white border border-sky-500/30 shadow-[0_0_15px_rgba(14,165,233,0.1)]' 
                  : 'text-slate-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 overflow-hidden relative z-10">
                  <div className="text-left">
                    <div className="text-sm font-bold truncate tracking-tight flex items-center gap-2">
                      {country.name}
                      <span className="text-lg opacity-90 group-hover:scale-125 transition-transform duration-300">
                        {getFlagEmoji(country.iso_3166_1)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Region Code: {country.iso_3166_1}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 relative z-10">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                    selectedCountry === country.iso_3166_1 
                    ? 'bg-sky-500 text-white' 
                    : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-200'
                  }`}>
                    {country.stationcount.toLocaleString()}
                  </span>
                  <div className={`transition-transform duration-300 ${selectedCountry === country.iso_3166_1 ? 'rotate-90 text-sky-400' : 'text-slate-700 opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </div>
                </div>
                {selectedCountry === country.iso_3166_1 && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500"></div>
                )}
              </button>
            ))}
            {filteredCountries.length === 0 && (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-3">
                <div className="opacity-20"><ICONS.Search /></div>
                <p className="text-sm italic">No territories found for "{search}"</p>
                <button 
                  onClick={() => setSearch('')}
                  className="text-xs text-sky-500 font-bold hover:underline"
                >
                  Clear search
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorldMap;
