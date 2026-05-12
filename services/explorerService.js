// ── services/explorerService.js ──────────────────────────────────────────────
// DB tabloları: pois, poi_media, poi_user_comments, poi_translations,
//               cities, countries, active_explorers

import { api } from './api';

// ── Coğrafi ──────────────────────────────────────────────────────────────────
export const getCountries         = ()               => api.get('/geo/countries');
export const getCitiesByCountry   = (code)           => api.get(`/geo/countries/${code}/cities`);
export const getCityDetail        = (id)             => api.get(`/geo/cities/${id}`);
export const detectCityByLocation = (lat, lng)       => api.get(`/geo/detect-city?lat=${lat}&lng=${lng}`);
export const detectCountry        = (lat, lng)       => api.get(`/geo/detect-country?lat=${lat}&lng=${lng}`);

// ── POI Arama & Listeleme ─────────────────────────────────────────────────────
// pois WHERE GIST(location) sorgular
export const searchPOIs     = (q, cityId)               => api.get(`/pois/search?q=${encodeURIComponent(q)}${cityId?`&city_id=${cityId}`:''}`);
export const getNearbyPOIs  = (lat, lng, radius=500)    => api.get(`/pois/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
export const getPOIsInBBox  = (minLng,minLat,maxLng,maxLat) => api.get(`/pois/bbox?min_lng=${minLng}&min_lat=${minLat}&max_lng=${maxLng}&max_lat=${maxLat}`);
export const getPopularPOIs = (cityId)                  => api.get(`/pois/popular?city_id=${cityId}`);
export const getSponsoredPOIs = (cityId)                => api.get(`/pois/sponsored?city_id=${cityId}`);
export const getPOIsByCategory = (cityId, cat)          => api.get(`/pois/nearby?city_id=${cityId}&category=${cat}`);
export const getPOIsByTags  = (tags, cityId)            => api.get(`/pois/by-tags?tags=${tags.join(',')}&city_id=${cityId}`);

// ── POI Detay ─────────────────────────────────────────────────────────────────
export const getPOIDetail   = (id, lang='tr')           => api.get(`/pois/${id}?lang=${lang}`);
// poi_media (resmi) + post_attachments WHERE shared_to_poi=TRUE
export const getPOIMedia    = (id)                      => api.get(`/pois/${id}/media`);
export const getPOIComments = (id)                      => api.get(`/pois/${id}/comments`);
export const addPOIComment  = (id, data)                => api.post(`/pois/${id}/comments`, data);
export const updatePOIComment = (poiId, commentId, data) => api.patch(`/pois/${poiId}/comments/${commentId}`, data);
export const deletePOIComment = (poiId, commentId)       => api.delete(`/pois/${poiId}/comments/${commentId}`);

// Kullanıcı mekan önerisi — pois INSERT source='user', verified=FALSE
export const submitPOI       = (data)                  => api.post('/pois', data);

// ── Aktif Gezginler — active_explorers tablosu (TTL: expires_at=+5dk) ────────
// Kaşif haritasında "X gezgin yakında" göstergesi için
export const updateExplorerStatus = (lat, lng, isOpen, cityId) =>
  api.patch('/together/explorer-status', { lat, lng, is_open: isOpen, city_id: cityId });
export const removeExplorerStatus = () => api.delete('/together/explorer-status');
export const getNearbyExplorers   = (lat, lng, radius=100) =>
  api.get(`/together/nearby-explorers?lat=${lat}&lng=${lng}&radius=${radius}`);

// ── Genel Keşif ──────────────────────────────────────────────────────────────
export const globalSearch      = (q)          => api.get(`/explore/search?q=${encodeURIComponent(q)}`);
export const getTrending       = (cityId)     => api.get(`/explore/trending/${cityId}`);
export const getCityOverview   = (cityId)     => api.get(`/explore/city/${cityId}/overview`);
// POI + etkinlik + gezgin tek çağrıda — harita açılışında
export const getNearbyAll      = (lat, lng, r=500) => api.get(`/explore/nearby-all?lat=${lat}&lng=${lng}&radius=${r}`);
