// ── hooks/useExplorer.js ─────────────────────────────────────────────────────
// Kaşif ekranı — harita, POI pinleri, LLM rota
// DB: pois (ST_DWithin), routes (LLM), active_explorers

import { useState, useCallback } from 'react';
import { getPOIsInBBox, getNearbyExplorers, searchPOIs } from '../services/explorerService';
import { generateLLMRouteSingle } from '../services/routeService';
import { getNearbyEvents } from '../services/eventService';
import { getActiveSessions } from '../services/liveService';

const QUICK_PROMPTS = [
  'Tarihi bir rota öner',
  'Kafe ve kahve turu yap',
  'Doğa yürüyüşü güzergahı',
  'Fotoğraf çekimi için yerler',
  'Akşam yemeği rotası',
];

export default function useExplorer(cityId) {
  const [pois, setPOIs]             = useState([]);
  const [route, setRoute]           = useState(null); // LLM rota sonucu
  const [nearbyExplorers, setExplorers] = useState([]);
  const [events, setEvents]         = useState([]);
  const [liveSessions, setLive]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [error, setError]           = useState(null);

  // Harita kayınca BBox POI sorgula — pois USING GIST(location)
  const loadPOIsForBBox = useCallback(async (region) => {
    try {
      const { latitude:lat, longitude:lng, latitudeDelta:dlat, longitudeDelta:dlng } = region;
      const minLng=lng-dlng/2, maxLng=lng+dlng/2, minLat=lat-dlat/2, maxLat=lat+dlat/2;
      const data = await getPOIsInBBox(minLng, minLat, maxLng, maxLat);
      setPOIs(data.slice(0, 80)); // Harita performansı için sınırla
    } catch {}
  }, []);

  // Yakındaki etkinlik + gezgin + canlı yayın
  const loadNearbyData = useCallback(async (lat, lng) => {
    try {
      const [exp, evs, live] = await Promise.all([
        getNearbyExplorers(lat, lng, 200),
        getNearbyEvents(lat, lng, 3000),
        cityId ? getActiveSessions(cityId) : Promise.resolve([]),
      ]);
      setExplorers(exp);
      setEvents(evs);
      setLive(live);
    } catch {}
  }, [cityId]);

  // LLM rota oluştur — composite_score motoru (popülerlik+kalite+sponsor+zaman+tercih)
  const generateRoute = useCallback(async (prompt, userLocation, preferences=[]) => {
    if (!prompt?.trim() || !cityId) return;
    try {
      setLlmLoading(true); setError(null); setRoute(null);
      const result = await generateLLMRouteSingle({
        city_id: cityId,
        preferences: [...preferences, prompt],
        duration_hours: 3,
        transport_mode: 'walking',
        start_time: new Date().toTimeString().slice(0,5),
      });
      setRoute(result);
    } catch (e) {
      setError(e.message || 'Rota oluşturulamadı');
    } finally {
      setLlmLoading(false);
    }
  }, [cityId]);

  const clearRoute = () => { setRoute(null); setError(null); };

  return {
    pois, route, nearbyExplorers, events, liveSessions,
    loading, llmLoading, error,
    loadPOIsForBBox, loadNearbyData, generateRoute, clearRoute,
    QUICK_PROMPTS,
  };
}
