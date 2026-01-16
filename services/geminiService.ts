
import { GoogleGenAI, Type } from "@google/genai";

export const geminiService = {
  async recommendStations(moodOrQuery: string) {
    // Create a new instance right before making the API call as per guidelines
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are a world-class music curator. Suggest a highly tailored global radio genre and specific regions based on these combined factors: "${moodOrQuery}". 
      If multiple genres or moods are provided, find a specific niche or "hybrid" genre that satisfies all the requirements (e.g., if user asks for 'Jazz' and 'Electronic', you might suggest 'Nu-Jazz' or 'Acid Jazz').
      Format the response as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            genre: { type: Type.STRING, description: "A primary genre tag to search for." },
            description: { type: Type.STRING, description: "A short, engaging description of how this fits all requested factors." },
            suggestedCountries: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of 2-3 countries famous for this specific niche or style."
            }
          },
          required: ["genre", "description", "suggestedCountries"]
        }
      }
    });

    try {
      // Use .text property directly and trim it before parsing
      const jsonStr = response.text?.trim();
      if (!jsonStr) return null;
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse Gemini response", e);
      return null;
    }
  }
};
