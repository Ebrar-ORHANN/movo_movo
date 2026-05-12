// ── services/eventService.js ─────────────────────────────────────────────────
// DB tabloları: events, event_stops, event_owners, event_attendees, event_ratings, waiting_room
import { api } from './api';

export const createEvent       = (data) => api.post('/events', data);
export const getEvent          = (id)   => api.get(`/events/${id}`);
export const updateEvent       = (id,d) => api.patch(`/events/${id}`, d);
export const cancelEvent       = (id)   => api.patch(`/events/${id}/cancel`);
export const getNearbyEvents   = (lat,lng,r=5000) => api.get(`/events/nearby/search?lat=${lat}&lng=${lng}&radius=${r}`);
export const getEventsByCity   = (cityId, status='upcoming') => api.get(`/events/city/${cityId}?status=${status}`);
export const getUserEvents     = (userId) => api.get(`/events/user/${userId}`);

// Katılım — event_attendees INSERT + waiting_room gerekirse
export const joinEvent         = (id)   => api.post(`/events/${id}/join`);
export const leaveEvent        = (id)   => api.delete(`/events/${id}/attend`);
// QR check-in — check_in_at=NOW(), participation_score artar (trigger)
export const checkInEvent      = (token) => api.post('/events/check-in', { check_in_token: token });
export const getEventAttendees = (id)   => api.get(`/events/${id}/attendees`);
export const updateAttendeeLocation = (id,lat,lng) =>
  api.patch(`/events/${id}/location?lat=${lat}&lng=${lng}`);

export const addEventStop      = (id,d) => api.post(`/events/${id}/stops`, d);
export const addEventCoOwner   = (eid,uid) => api.post(`/events/${eid}/owners`, { user_id: uid });
export const rateParticipant   = (eid,d) => api.post(`/events/${eid}/ratings`, d);
export const getEventPosts     = (id)   => api.get(`/events/${id}/posts`);
export const getWaitingRoom    = (id)   => api.get(`/events/${id}/waiting-room`);
export const respondWaitingRoom = (wid,action) => api.patch(`/events/waiting-room/${wid}?action=${action}`);

export const EVENT_CATEGORY_MAP = {
  nature:      { icon: '🌿', label: 'Doğa',     color: '#4CAF50' },
  camping:     { icon: '⛺', label: 'Kamp',      color: '#4CAF50' },
  cycling:     { icon: '🚴', label: 'Bisiklet',  color: '#FF9800' },
  photography: { icon: '📸', label: 'Fotoğraf',  color: '#2196F3' },
  history:     { icon: '🏛️', label: 'Tarih',     color: '#795548' },
  food:        { icon: '🍽️', label: 'Lezzet',    color: '#FF6B35' },
  culture:     { icon: '🎭', label: 'Kültür',    color: '#9C27B0' },
  other:       { icon: '🎯', label: 'Diğer',     color: '#607D8B' },
};
