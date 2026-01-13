
import { Station } from '../types';

const API_BASE = 'https://de1.api.radio-browser.info/json';

export interface Country {
  name: string;
  iso_3166_1: string;
  stationcount: number;
}

export type StationSort = 'name' | 'votes' | 'bitrate' | 'country' | 'clickcount' | 'random';

export const radioService = {
  async getTopStations(limit = 30, offset = 0): Promise<Station[]> {
    const response = await fetch(`${API_BASE}/stations/topvote/${limit}?offset=${offset}`);
    return response.json();
  },

  async searchStations(params: { 
    name?: string; 
    tag?: string; 
    country?: string; 
    limit?: number; 
    offset?: number;
    order?: StationSort;
    reverse?: boolean;
  }): Promise<Station[]> {
    const query = new URLSearchParams({
      limit: (params.limit || 30).toString(),
      offset: (params.offset || 0).toString(),
      hidebroken: 'true',
      order: params.order || 'votes',
      reverse: params.reverse !== undefined ? params.reverse.toString() : 'true'
    });
    
    if (params.name) query.append('name', params.name);
    if (params.tag) query.append('tag', params.tag);
    if (params.country) query.append('country', params.country);

    const response = await fetch(`${API_BASE}/stations/search?${query.toString()}`);
    return response.json();
  },

  async getStationsByCountry(countryCode: string, limit = 30, offset = 0, order: StationSort = 'votes'): Promise<Station[]> {
    const query = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      hidebroken: 'true',
      order: order,
      reverse: 'true'
    });
    const response = await fetch(`${API_BASE}/stations/bycountrycodeexact/${countryCode.toLowerCase()}?${query.toString()}`);
    return response.json();
  },

  async getCountries(): Promise<Country[]> {
    const response = await fetch(`${API_BASE}/countries`);
    const data = await response.json();
    return data
      .filter((c: any) => c.iso_3166_1 && c.stationcount > 0)
      .sort((a: any, b: any) => b.stationcount - a.stationcount);
  },

  async voteForStation(stationuuid: string): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await fetch(`${API_BASE}/vote/${stationuuid}`, { method: 'POST' });
      const data = await response.json();
      return data;
    } catch (err) {
      console.error("Voting failed", err);
      return { ok: false, message: "Network error" };
    }
  }
};
