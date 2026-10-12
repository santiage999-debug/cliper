// Planes de créditos. Precios en USD. "regular" = precio de lista para mostrar descuento.
export const TIERS = {
  free:    { name: 'Gratis',  height: 1280, width: 720,  fps: 30, watermark: true,  priority: 0, premiumFx: false, maxClipLen: 45, maxClipsPerJob: 5 },
  basico:  { name: 'Básico',  height: 1280, width: 720,  fps: 30, watermark: false, priority: 1, premiumFx: false, maxClipLen: 60, maxClipsPerJob: 8 },
  medium:  { name: 'Medium',  height: 1920, width: 1080, fps: 30, watermark: false, priority: 2, premiumFx: true,  maxClipLen: 60, maxClipsPerJob: 10 },
  pro:     { name: 'Pro',     height: 1920, width: 1080, fps: 30, watermark: false, priority: 3, premiumFx: true,  maxClipLen: 90, maxClipsPerJob: 15 },
  premium: { name: 'Premium', height: 1920, width: 1080, fps: 60, watermark: false, priority: 4, premiumFx: true,  maxClipLen: 120, maxClipsPerJob: 20 },
  plus:    { name: 'Plus',    height: 2560, width: 1440, fps: 60, watermark: false, priority: 5, premiumFx: true,  maxClipLen: 180, maxClipsPerJob: 30 },
};
export const PLANS = [
  { id: 'basico',  name: 'Básico',  price: 3,  regular: 5,  credits: 60,  color: '#38bdf8', features: ['60 créditos IA (1 crédito = 1 clip)', 'Export 720p', 'Sin marca de agua', 'Clips de hasta 60 s', 'Biblioteca estándar'] },
  { id: 'medium',  name: 'Medium',  price: 8,  regular: 14, credits: 200, color: '#a78bfa', features: ['200 créditos IA', 'Export 1080p Full HD', 'Sin marca de agua', 'Efectos premium y LUTs cinematográficos', 'Prioridad normal'] },
  { id: 'pro',     name: 'Pro',     price: 10, regular: 20, credits: 300, color: '#f472b6', popular: true, features: ['300 créditos IA', 'Export 1080p', 'Sin marca de agua', 'Todos los efectos + subtítulos animados', 'Cola prioritaria', 'Clips de hasta 90 s'] },
  { id: 'premium', name: 'Premium', price: 13, regular: 28, credits: 500, color: '#fb923c', features: ['500 créditos IA', 'Export 1080p a 60 fps', 'Sin marca de agua', 'Prioridad alta', 'Hasta 20 clips por video', 'Clips de hasta 2 min'] },
  { id: 'plus',    name: 'Plus',    price: 15, regular: 35, credits: 800, color: '#facc15', best: true, features: ['800 créditos IA', 'Export 2K (1440p) a 60 fps', 'Sin marca de agua', 'Máxima prioridad', 'Hasta 30 clips por video', 'Clips de hasta 3 min', 'Soporte VIP'] },
];
export const TIER_ORDER = ['free','basico','medium','pro','premium','plus'];
export const FREE_LIMIT = 5, FREE_WINDOW_MS = 3*24*3600*1000;
