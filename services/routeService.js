// ── services/routeService.js ──────────────────────────────────────────────────
// DB tabloları: routes, route_stops, route_snapshots, route_translations
// LLM: POST /routes/generate/llm/* → utils/llm.py composite_score motoru

import { api } from './api';

// ── Rota CRUD ─────────────────────────────────────────────────────────────────
export const createRoute    = (data)    => api.post('/routes', data);
export const getRoute       = (id, lang='tr') => api.get(`/routes/${id}?lang=${lang}`);
export const updateRoute    = (id, d)   => api.patch(`/routes/${id}`, d);
export const deleteRoute    = (id)      => api.delete(`/routes/${id}`);
export const getUserRoutes  = (userId)  => api.get(`/routes/user/${userId}`);
export const getExploreRoutes = (cityId) => api.get(`/routes/explore/${cityId}`);
export const getRoutesInBBox  = (minLng,minLat,maxLng,maxLat) =>
  api.get(`/routes/bbox/search?min_lng=${minLng}&min_lat=${minLat}&max_lng=${maxLng}&max_lat=${maxLat}`);

// ── Kayıt modu — is_recording=TRUE, visibility='private' ─────────────────────
export const startRecording   = (id)         => api.patch(`/routes/${id}/recording/start`);
export const updateRecordingLoc = (id,lat,lng) => api.patch(`/routes/${id}/recording/location?lat=${lat}&lng=${lng}`);
export const stopRecording    = (id, distM, durSec) =>
  api.patch(`/routes/${id}/recording/stop?distance_m=${distM}&duration_sec=${durSec}`);

// ── Snapshot — route_snapshots tablosu ───────────────────────────────────────
export const saveRoute      = (id)    => api.post(`/routes/${id}/save`);
export const unsaveRoute    = (snapId) => api.delete(`/routes/snapshots/${snapId}`);
export const getSavedRoutes = ()      => api.get('/routes/me/saved');

// ── Duraklar — route_stops tablosu ───────────────────────────────────────────
// suggested_time, est_duration_min alanları LLM tarafından doldurulur
export const addRouteStop     = (routeId, data) => api.post(`/routes/${routeId}/stops`, data);
export const updateRouteStop  = (stopId, data)  => api.patch(`/routes/stops/${stopId}`, data);
export const deleteRouteStop  = (stopId)        => api.delete(`/routes/stops/${stopId}`);
export const markStopArrived  = (stopId)        => api.patch(`/routes/stops/${stopId}/arrive`);
export const skipStop         = (stopId)        => api.patch(`/routes/stops/${stopId}/skip`);
export const reorderStops     = (routeId, seqs) => api.patch(`/routes/${routeId}/stops/reorder`, seqs);

// ── LLM Rota Oluşturma ────────────────────────────────────────────────────────
// Tek şehir: composite_score(popülerlik+kalite+sponsor+zaman+tercih) motoru
// → routes INSERT source='llm' + route_stops INSERT suggested_time/est_duration_min
export const generateLLMRouteSingle = (data) =>
  api.post('/routes/generate/llm/single', data);
  // data: { city_id, preferences, duration_hours, transport_mode, start_time }

// Şehirler arası: güzergah koridoru, dinamik radius, forced_poi_ids
export const generateLLMRouteIntercity = (data) =>
  api.post('/routes/generate/llm/intercity', data);
  // data: { start_city_id, end_city_id, search_terms, radius_km, forced_poi_ids... }

// Önizleme: LLM'e gitmeden önce kullanıcıya POI listesi göster
export const previewIntercityPOIs = (params) => {
  const q = new URLSearchParams(params).toString();
  return api.get(`/routes/intercity/preview?${q}`);
};

// ── Çeviriler — route_translations tablosu ────────────────────────────────────
// auto_translate_route() arka planda 4 dile çevirir (BackgroundTasks)
export const getRouteTranslations  = (id)        => api.get(`/routes/${id}/translations`);
export const upsertRouteTranslation = (id, data) => api.post(`/routes/${id}/translations`, data);

// ── Yardımcı ─────────────────────────────────────────────────────────────────
export function formatDistance(m) {
  if (!m) return '—';
  return m < 1000 ? `${m}m` : `${(m/1000).toFixed(1)} km`;
}
export function formatDuration(sec) {
  if (!sec) return '—';
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
  return h > 0 ? `${h} sa ${m > 0 ? m+' dk' : ''}`.trim() : `${m} dk`;
}
export function getDifficulty(distM, durationSec) {
  const score = (distM||0)/1000 + (durationSec||0)/3600;
  if (score < 3) return 'Kolay';
  if (score < 8) return 'Orta';
  return 'Zor';
}
export const TRANSPORT_ICONS = {
  walking: '🚶', cycling: '🚴', driving: '🚗', transit: '🚌',
};
