// ── constants/api.js ────────────────────────────────────────────────────────
// FastAPI backend URL — ngrok ile expose edilen adres .env'e yaz
// .env dosyasına: EXPO_PUBLIC_API_URL=https://xxxx.ngrok-free.app
export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';
export const WS_BASE  = API_BASE.replace('https','wss').replace('http','ws');
