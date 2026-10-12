// "Servidor" local: implementa la misma API que el backend Node, pero todo en el teléfono (IndexedDB + ffmpeg.wasm + Whisper)
import { putFile as idbPut, getFile as idbGet, delFile as idbDel, kvGet, kvSet, persist, quota } from './idb.js';
import { PLANS, TIERS, TIER_ORDER, FREE_LIMIT, FREE_WINDOW_MS } from './plans.js';
import * as L from './library.js';
import { mountBlob, unmount, readFile, rm, getFF, terminate } from './ff.js';
import { isNative, Native, fileUrl, fileBlob, withProgress } from './native.js';
import { probe, renderSegment, joinSegments, finalPass, buildAss, renderAiClip, ensureSfx, ensureMusic, SUB_STYLE_IDS } from './render.js';
import { analyzeVideo, extractPCM, transcribe, cancelAsr } from './analyze.js';
import { CapacitorHttp, Capacitor } from '@capacitor/core';

// En el teléfono el procesamiento es por CPU (WASM): resoluciones adaptadas
const MOBILE_TIERS = Object.fromEntries(Object.entries(TIERS).map(([k, t]) => [k, { ...t, width: Math.min(t.width, 1080), height: Math.min(t.height, 1920), fps: Math.min(t.fps, 30) }]));
let S = null; // estado
const now = () => Date.now(); const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(16).padStart(2, '0')).join('');
async function load() { if (S) return S; S = (await kvGet('state')) || { users: [], usage: [], redemptions: [], owners: {}, payments: [], media: [], jobs: [], attempts: [] };
  for (const j of S.jobs) if (j.status === 'queued' || j.status === 'running') { delete j.cancel; j.status = 'error'; j.error = 'La app se cerró durante el proceso'; refund(j, 0); }
  persist(); return S; }
let saveT = null; const save = () => { clearTimeout(saveT); saveT = setTimeout(() => kvSet('state', JSON.parse(JSON.stringify(S))), 400); };
const err = (status, msg, extra) => { const e = new Error(msg); e.status = status; e.data = { error: msg, ...extra }; throw e; };
const sha = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))), b => b.toString(16).padStart(2, '0')).join('');
async function hashPass(p, salt) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(p), 'PBKDF2', false, ['deriveBits']);
  const b = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, k, 256); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); }
const session = () => localStorage.getItem('cliper.uid');
const me = () => { const u = S.users.find(u => u.id === +session()); if (!u) err(401, 'Inicia sesión para continuar'); return u; };
const tierOf = u => MOBILE_TIERS[u.unlimited ? 'plus' : u.plan] || MOBILE_TIERS.free;
function usage(u) { const since = now() - FREE_WINDOW_MS; const rows = S.usage.filter(r => r.user === u.id && r.kind === 'free' && r.ts > since).sort((a, b) => a.ts - b.ts);
  const used = Math.max(0, rows.reduce((a, r) => a + r.n, 0)); return { freeUsed: used, freeLeft: Math.max(0, FREE_LIMIT - used), freeLimit: FREE_LIMIT, resetAt: rows.length ? rows[0].ts + FREE_WINDOW_MS : null }; }
const pub = u => ({ id: u.id, email: u.email, name: u.name, credits: u.credits, plan: u.plan, unlimited: !!u.unlimited, tier: tierOf(u), tierId: u.unlimited ? 'plus' : u.plan, usage: usage(u) });

// Códigos: solo hashes SHA-256 (minúsculas). En una app sin servidor no pueden protegerse al 100%.
const CODES = [{ id: 'welcome', hash: '9db02d7492fc12918b352391456aaee5af07feeb1ab1c234b1c19f20a45b9584', type: 'credits', amount: 150 },
               { id: 'owner', hash: '9be26725ca258abf46de8c17802b28a8a035c667e51feb5198907bb132c59ed9', type: 'owner' }];

// ---- media ----
const urls = new Map();
async function blobUrl(id) { if (urls.has(id)) return urls.get(id); const b = await getFile(id); if (!b) return null; const u = URL.createObjectURL(b); urls.set(id, u); return u; }
async function mediaPub(m) { return m && { ...m, url: m.path ? fileUrl(m.path) : await blobUrl(m.id), thumbUrl: m.thumb ? await blobUrl(m.id + ':thumb') : null }; }
async function makeThumb(blob, t = 1) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = URL.createObjectURL(blob);
  try { await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 6000); }); await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(t, (v.duration || 1) / 3); setTimeout(r, 3000); });
    const c = document.createElement('canvas'); c.width = 360; c.height = Math.round(360 * (v.videoHeight || 640) / (v.videoWidth || 360)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); } catch { return null; } finally { URL.revokeObjectURL(v.src); } }
// Archivos: se usan directamente desde memoria (el File del selector, sin copiarlo); la copia en IndexedDB es opcional y con límite de tiempo
const mem = new Map();
const timeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
async function getFile(id) { if (mem.has(id)) return mem.get(id); try { return await timeout(idbGet(id), 15000, 'IndexedDB no responde'); } catch (e) { console.warn(e); return null; } }
async function putFile(id, blob, ms = 30000) { mem.set(id, blob); try { await timeout(idbPut(id, blob), ms, 'IndexedDB no responde'); return true; } catch (e) { console.warn('persist', e); return false; } }
async function delFile(id) { mem.delete(id); try { await timeout(idbDel(id), 8000, 'x'); } catch {} }
async function canStore(size) { const q = await quota(); return !q || !q.quota || (q.quota - q.usage) > size * 1.3 + 50e6; }
async function persistInBackground(m, blob) {
  if (!(await canStore(blob.size))) { m.ephemeral = 1; m.persistMsg = 'Sin espacio suficiente en el navegador: el video original solo estará disponible en esta sesión.'; save(); return; }
  const ok = await putFile(m.id, blob, Math.max(60000, blob.size / 2e6 * 1000));
  if (!ok) { m.ephemeral = 1; m.persistMsg = 'El navegador no permitió guardar el original: solo estará disponible en esta sesión.'; } else delete m.ephemeral; save(); }
// Metadatos rápidos con <video> (sin cargar el motor wasm ni leer el archivo completo)
async function quickProbe(blob) { const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; const u = URL.createObjectURL(blob); v.src = u;
  try { await timeout(new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(new Error('El navegador no puede leer este video')); }), 20000, 'Tiempo agotado leyendo el video');
    return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, hasVideo: v.videoWidth > 0, hasAudio: true, light: true }; } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(u); } }
async function fullProbe(blob, name) { const mt = await mountBlob(blob, 'f' + (name.match(/\.\w+$/)?.[0] || '.mp4')); try { return await probe(mt.path); } finally { await unmount(mt.dir); } }
async function registerMedia(user, blob, name, kind, meta, onP) {
  const id = rid(); const big = blob.size > 40e6; let p;
  onP?.(10, 'Leyendo video…');
  if (big) { try { p = await quickProbe(blob); } catch (e) { onP?.(20, 'Cargando motor de video…'); p = await fullProbe(blob, name); } }
  else { onP?.(20, 'Cargando motor de video…'); p = await timeout(fullProbe(blob, name), 180000, 'El motor de video no cargó (revisa tu conexión)'); }
  if (!p.hasVideo && !p.hasAudio) err(400, 'Archivo no válido o formato no soportado');
  if (kind !== 'audio' && !p.hasVideo) kind = 'audio';
  onP?.(60, 'Creando miniatura…');
  let thumb = false; if (p.hasVideo) { const t = await makeThumb(blob); if (t) { await putFile(id + ':thumb', t, 10000); thumb = true; } }
  const m = { id, user_id: user.id, kind, name, duration: p.duration, width: p.width, height: p.height, has_audio: p.hasAudio ? 1 : 0, vcodec: p.vcodec, thumb, meta: meta || null, ts: now(), size: blob.size, light: p.light ? 1 : 0 };
  mem.set(id, blob); S.media.push(m); save();
  if (big) persistInBackground(m, blob); else if (!(await putFile(id, blob, 30000))) m.ephemeral = 1;
  onP?.(100, 'Listo'); return m;
}
// Antes de procesar: metadatos exactos (pista de audio, códec) con ffmpeg sobre el archivo montado
async function ensureProbed(m) { if (!m.light) return; const b = await getFile(m.id); if (!b) return; const p = await fullProbe(b, m.name);
  Object.assign(m, { has_audio: p.hasAudio ? 1 : 0, vcodec: p.vcodec, width: p.width || m.width, height: p.height || m.height, duration: p.duration || m.duration, light: 0 }); save(); }
const missing = () => err(410, 'El video original ya no está disponible (el navegador no lo guardó). Vuelve a seleccionarlo.');
async function registerNative(user, info) {
  const id = rid(); if (!info.hasVideo && !info.hasAudio) err(400, 'Archivo no válido o formato no soportado');
  let thumb = false; if (info.hasVideo) { const t = await makeThumbUrl(fileUrl(info.path), info.duration); if (t) { await putFile(id + ':thumb', t); thumb = true; } }
  const m = { id, user_id: user.id, kind: info.hasVideo ? 'video' : 'audio', name: info.name, duration: info.duration, width: info.width, height: info.height, has_audio: info.hasAudio ? 1 : 0, path: info.path, thumb, meta: null, ts: now(), size: info.size };
  S.media.push(m); save(); return m;
}
async function makeThumbUrl(src, dur) { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
  try { await new Promise((r, j) => { v.onloadeddata = r; v.onerror = j; setTimeout(r, 6000); }); await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(2, (dur || 3) / 3); setTimeout(r, 3000); });
    const c = document.createElement('canvas'); c.width = 360; c.height = Math.round(360 * (v.videoHeight || 640) / (v.videoWidth || 360)); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.8)); } catch { return null; } finally { v.removeAttribute('src'); v.load(); } }
// Fuente para ffmpeg.wasm: en Android se recorta solo el tramo necesario (sin recodificar); en navegador se monta el Blob (WORKERFS, sin copiar)
async function withSource(m, s0, s1, fn) {
  if (m.path) { const r = await Native.trim({ path: m.path, start: Math.max(0, s0), end: Math.min(m.duration, s1) }); const blob = await fileBlob(r.file); Native.deleteFile({ path: r.file });
    const base = Math.max(0, s0) - r.offset; const mt = await mountBlob(blob, 'seg.mp4'); try { return await fn(mt.path, base); } finally { await unmount(mt.dir); } }
  return withMounted(m, src => fn(src, 0));
}
const getMedia = (u, id) => S.media.find(m => m.id === id && m.user_id === u.id);
async function withMounted(m, fn) { const b = await getFile(m.id); if (!b) missing(); const mt = await mountBlob(b, 'src.' + (m.name.match(/\.(\w+)$/)?.[1] || 'mp4'));
  try { return await fn(mt.path, b); } finally { await unmount(mt.dir); } }

// ---- cuota ----
function reserve(u, want) { if (u.unlimited) return { n: want, free: 0, credits: 0 };
  const free = Math.min(usage(u).freeLeft, want); const credits = Math.min(u.credits, want - free); const n = free + credits; if (!n) return { n: 0 };
  if (free) S.usage.push({ user: u.id, ts: now(), kind: 'free', n: free }); if (credits) { u.credits -= credits; S.usage.push({ user: u.id, ts: now(), kind: 'credit', n: credits }); }
  save(); return { n, free, credits }; }
function refund(j, produced) { let back = (j.rf || 0) + (j.rc || 0) - (produced || 0); if (back <= 0) return; const u = S.users.find(x => x.id === j.user_id); if (!u) return;
  const cr = Math.min(back, j.rc || 0); u.credits += cr; const fr = Math.min(back - cr, j.rf || 0); if (fr) S.usage.push({ user: u.id, ts: now(), kind: 'free', n: -fr });
  j.rc -= cr; j.rf -= fr; save(); }

// ---- cola de trabajos (uno a la vez: el móvil procesa por CPU) ----
const queue = []; let running = false; const listeners = new Set();
export const onJobs = fn => { listeners.add(fn); return () => listeners.delete(fn); };
let fgT = 0;
const setJob = (j, f) => { Object.assign(j, f);
  if (j.status === 'running' && j.startedAt && j.progress > 3) { const el = (now() - j.startedAt) / 1000; const est = el * (100 - j.progress) / j.progress; j.eta = Math.round(j.eta == null ? est : j.eta * 0.7 + est * 0.3); }
  if (isNative && j.status === 'running' && now() - fgT > 2500) { fgT = now(); Native.foreground({ on: true, title: 'Cliper · ' + (j.progress || 0) + '%', text: j.msg || 'Procesando…', progress: j.progress || 0 }).catch(() => {}); }
  save(); listeners.forEach(l => l(j)); };
function enqueue(u, type, input, fn, r = {}) { const j = { id: 'job_' + rid(), user_id: u.id, type, status: 'queued', progress: 0, msg: 'En cola…', input, result: null, error: null, rf: r.free || 0, rc: r.credits || 0, ts: now() };
  S.jobs.unshift(j); S.jobs = S.jobs.slice(0, 60); save(); queue.push({ j, fn }); pump(); return j.id; }
export function cancelJob(j) { j.cancel = true; Native?.cancel().catch(() => {}); terminate(); cancelAsr(); }
async function pump() { if (running || !queue.length) return; running = true; const { j, fn } = queue.shift();
  if (j.cancel) { setJob(j, { status: 'cancelled', msg: 'Cancelado' }); refund(j, 0); running = false; return pump(); }
  setJob(j, { status: 'running', msg: 'Preparando motor de video…', startedAt: now(), eta: null });
  if (isNative) { Native.keepAwake({ on: true }).catch(() => {}); Native.foreground({ on: true, title: 'Cliper', text: 'Procesando video…' }).catch(() => {}); }
  const wake = await navigator.wakeLock?.request?.('screen').catch(() => null);
  try { await getFF(); j.check = () => { if (j.cancel) throw new Error('cancelled'); };
    const res = await fn((p, msg) => { j.check(); setJob(j, msg ? { progress: Math.max(j.progress, Math.round(p)), msg } : { progress: Math.max(j.progress, Math.round(p)) }); }, j); setJob(j, { status: 'done', progress: 100, msg: 'Listo', result: res }); }
  catch (e) { console.error(e); if (j.cancel) { terminate(); setJob(j, { status: 'cancelled', msg: 'Cancelado', error: 'Cancelado por el usuario' }); } else setJob(j, { status: 'error', error: String(e.message || e).slice(0, 1500), msg: 'Error' }); refund(j, j.produced || 0); }
  finally { wake?.release?.().catch(() => {}); delete j.check; if (isNative && !queue.length) { Native.keepAwake({ on: false }).catch(() => {}); Native.foreground({ on: false }).catch(() => {}); } running = false; save(); pump(); } }

// ---- rutas ----
const routes = {
  'POST /api/auth/register': async ({ email, password, name }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || '')) err(400, 'Email inválido'); if (!password || password.length < 6) err(400, 'La contraseña debe tener al menos 6 caracteres');
    email = email.toLowerCase(); if (S.users.some(u => u.email === email)) err(409, 'Ese email ya está registrado en este teléfono');
    const salt = rid(); const u = { id: (S.users.reduce((a, x) => Math.max(a, x.id), 0) + 1), email, name: name || email.split('@')[0], salt, pass: await hashPass(password, salt), credits: 0, plan: 'free', unlimited: 0, created: now() };
    S.users.push(u); save(); localStorage.setItem('cliper.uid', u.id); return { user: pub(u) }; },
  'POST /api/auth/login': async ({ email, password }) => { const u = S.users.find(x => x.email === String(email || '').toLowerCase());
    if (!u || (await hashPass(password || '', u.salt)) !== u.pass) err(401, 'Email o contraseña incorrectos'); localStorage.setItem('cliper.uid', u.id); return { user: pub(u) }; },
  'POST /api/auth/logout': async () => { localStorage.removeItem('cliper.uid'); return { ok: true }; },
  'GET /api/me': async () => ({ user: pub(me()) }),
  'GET /api/plans': async () => ({ plans: PLANS, tiers: MOBILE_TIERS, free: { limit: FREE_LIMIT, days: 3 } }),
  /* PUNTO DE INTEGRACIÓN DE PAGOS: en Android usar Google Play Billing (p. ej. plugin cordova-plugin-purchase / RevenueCat)
     y validar la compra en un servidor antes de acreditar. Aquí la compra es simulada. */
  'POST /api/checkout': async ({ planId }) => { const u = me(); const plan = PLANS.find(p => p.id === planId); if (!plan) err(400, 'Plan inválido');
    const p = { id: 'pay_' + rid(), user_id: u.id, plan: plan.id, amount: plan.price, status: 'pending', ts: now() }; S.payments.push(p); save(); return { paymentId: p.id, mode: 'mock', amount: plan.price, plan }; },
  'POST /api/checkout/:id/confirm': async (b, prm) => { const u = me(); const p = S.payments.find(x => x.id === prm.id && x.user_id === u.id); if (!p) err(404, 'Pago no encontrado');
    if (p.status !== 'paid') { const plan = PLANS.find(x => x.id === p.plan); p.status = 'paid'; u.credits += plan.credits; if (TIER_ORDER.indexOf(plan.id) > TIER_ORDER.indexOf(u.plan)) u.plan = plan.id; save(); }
    return { ok: true, user: pub(u) }; },
  'POST /api/redeem': async ({ code }) => { const u = me(); const t = now(); S.attempts = S.attempts.filter(a => a.ts > t - 600000);
    if (S.attempts.filter(a => a.user === u.id).length >= 10) err(429, 'Demasiados intentos. Espera unos minutos.', { user: pub(u) }); S.attempts.push({ user: u.id, ts: t });
    const h = await sha(String(code || '').trim().toLowerCase()); const def = CODES.find(c => c.hash === h); if (!def) err(400, 'Código inválido.', { user: pub(u) });
    if (def.type === 'credits') { if (S.redemptions.some(r => r.user === u.id && r.code === def.id)) err(400, 'Ya canjeaste este código en tu cuenta.', { user: pub(u) });
      S.redemptions.push({ user: u.id, code: def.id, ts: t }); u.credits += def.amount; save(); return { ok: true, message: `¡Bienvenido! Se añadieron ${def.amount} créditos a tu cuenta.`, user: pub(u) }; }
    const ow = S.owners[def.id]; if (ow && ow !== u.id) err(400, 'Este código ya fue reclamado por otra cuenta y está bloqueado.', { user: pub(u) });
    if (ow) return { ok: true, message: 'Ya eres el dueño: tu cuenta tiene uso ilimitado.', user: pub(u) };
    S.owners[def.id] = u.id; u.unlimited = 1; u.plan = 'plus'; save(); return { ok: true, message: '👑 Código de dueño activado: uso ilimitado y todas las funciones.', user: pub(u) }; },
  'GET /api/library': async () => ({ filters: L.FILTERS, cinematic: L.CINEMATIC, transitions: L.TRANSITIONS, textAnimations: L.TEXT_ANIMATIONS.map(({ id, name }) => ({ id, name })), textStyles: L.TEXT_STYLES, fonts: L.FONTS, subStyles: SUB_STYLE_IDS,
    sfx: L.SFX.map(({ id, name, cat }) => ({ id, name, cat, url: `./assets/sfx/${id}.mp3` })), music: L.MUSIC.map(({ id, name }) => ({ id, name, url: `./assets/music/${id}.mp3` })) }),
  'GET /api/media': async () => { const u = me(); return { media: await Promise.all(S.media.filter(m => m.user_id === u.id && !(m.ephemeral && !mem.has(m.id))).sort((a, b) => b.ts - a.ts).map(mediaPub)) }; },
  'DELETE /api/media/:id': async (b, prm) => { const u = me(); const m = getMedia(u, prm.id); if (!m) err(404, 'No encontrado');
    if (m.path) Native?.deleteFile({ path: m.path }); else await delFile(m.id); await delFile(m.id + ':thumb'); for (const k of [m.id, m.id + ':thumb']) if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
    S.media = S.media.filter(x => x !== m); save(); return { ok: true }; },
  'POST /api/media/upload': async ({ file, onProgress }) => { const u = me(); if (file?.nativeInfo) return { media: await mediaPub(await registerNative(u, file.nativeInfo)) }; const m = await registerMedia(u, file, file.name || 'video.mp4', (file.type || '').startsWith('audio') ? 'audio' : 'video', null, onProgress); return { media: await mediaPub(m) }; },
  'POST /api/media/link': async ({ url }) => { const u = me(); const id = enqueue(u, 'import', { url }, async prog => { const m = await importLink(u, url, prog); return { media: await mediaPub(m) }; }); return { jobId: id }; },
  'GET /api/jobs/:id': async (b, prm) => { const u = me(); const j = S.jobs.find(x => x.id === prm.id && x.user_id === u.id); if (!j) err(404, 'No encontrado'); return { job: { ...j, queuePos: queue.findIndex(q => q.j === j) + 1 || null } }; },
  'POST /api/jobs/:id/cancel': async (b, prm) => { const u = me(); const j = S.jobs.find(x => x.id === prm.id && x.user_id === u.id); if (!j) err(404, 'No encontrado'); cancelJob(j); return { ok: true }; },
  'GET /api/jobs': async () => { const u = me(); return { jobs: S.jobs.filter(j => j.user_id === u.id) }; },
  'POST /api/ai/clips': async (b) => { const u = me(); const tier = tierOf(u);
    if (!b.mediaId && !b.url) err(400, 'Elige un video o pega un enlace'); if (b.mediaId && !getMedia(u, b.mediaId)) err(404, 'Video no encontrado');
    const want = Math.max(1, Math.min(tier.maxClipsPerJob, +b.count || 3)); const r = reserve(u, want);
    if (!r.n) err(402, `Has usado tus ${FREE_LIMIT} clips gratis de estos 3 días y no tienes créditos. Compra un plan o canjea un código.`, { resetAt: usage(u).resetAt });
    const o = { count: r.n, minLen: Math.max(5, Math.min(+b.minLen || 15, tier.maxClipLen)), maxLen: Math.max(8, Math.min(+b.maxLen || 40, tier.maxClipLen)), subStyle: b.subStyle || 'viral', captions: b.captions !== false, punchIns: b.punchIns !== false, hookTitle: b.hookTitle !== false, sfx: b.sfx !== false, progressBar: b.progressBar !== false, grade: b.grade || 'viral', fit: b.fit || 'crop', whisper: b.captions !== false || b.whisper !== false, upper: b.upper !== false, model: b.model || 'onnx-community/whisper-base_timestamped', lang: b.lang || null };
    if (o.minLen > o.maxLen) o.minLen = Math.max(5, o.maxLen - 5);
    const id = enqueue(u, 'ai', { ...o, mediaId: b.mediaId, url: b.url, granted: r.n, requested: want }, async (prog, job) => {
      let m = b.mediaId ? getMedia(u, b.mediaId) : await importLink(u, b.url, (p, msg) => prog(p * 0.1, msg));
      if (!m.width) err(400, 'El archivo no tiene video');
      const res = await (async () => {
        if (!m.path) { prog(1, 'Preparando video…'); await ensureProbed(m); } const blob = m.path ? null : await getFile(m.id); if (!m.path && !blob) missing(); const mt = blob ? await mountBlob(blob, 'src.' + (m.name.match(/\.(\w+)$/)?.[1] || 'mp4')) : null;
        const url = blob ? URL.createObjectURL(blob) : null; const src = mt?.path;
        try {
          const an = await analyzeVideo({ src, url, nativePath: m.path, meta: { duration: m.duration, hasAudio: !!m.has_audio }, count: o.count, minLen: o.minLen, maxLen: o.maxLen, whisper: o.whisper, model: o.model, lang: o.lang }, (p, msg) => prog(m.path || !b.url ? p * 0.55 : 10 + p * 0.45, msg), job.check);
          await ensureSfx(['pop', 'whoosh']); const clips = [];
          for (let i = 0; i < an.clips.length; i++) { const c = an.clips[i]; const out = `/w/clip${i}.mp4`;
            job.check(); const rp = p => prog(55 + (i + p / 100) / an.clips.length * 44, `Editando clip ${i + 1} de ${an.clips.length}…`);
            const mm = { width: m.width, height: m.height, hasAudio: !!m.has_audio, duration: m.duration }, ro = { ...o, W: tier.width, H: tier.height, fps: tier.fps, watermark: tier.watermark };
            if (mt) await renderAiClip(src, mm, c, ro, out, rp);
            else await withSource(m, c.start - 0.5, c.end + 0.5, (seg, base) => renderAiClip(seg, mm, { ...c, start: c.start - base, end: c.end - base, track: c.track?.map(p => ({ ...p, t: p.t - base })) }, ro, out, rp));
            const data = await readFile(out); await rm(out);
            const cm = await registerMedia(u, new Blob([data], { type: 'video/mp4' }), `Clip ${i + 1} · ${c.title}`.slice(0, 120) + '.mp4', 'clip', { score: c.score, title: c.title, start: c.start, end: c.end, sourceId: m.id, cropX: c.cropX, faceFound: c.faceFound, punchIns: c.punchIns, text: c.text, words: c.words });
            clips.push(await mediaPub(cm)); job.produced = clips.length; }
          return { clips, analysis: { duration: an.duration, scenes: an.scenes.length, faces: an.faces, language: an.language, energy: an.energy, transcribed: an.words.length > 0 } };
        } finally { if (url) URL.revokeObjectURL(url); if (mt) await unmount(mt.dir).catch(() => {}); }
      })();
      refund(job, res.clips.length); return { ...res, source: await mediaPub(m) };
    }, r);
    return { jobId: id, granted: r.n, requested: want }; },
  'POST /api/export': async ({ project: p }) => { const u = me(); const tier = tierOf(u);
    if (!p?.segments?.length) err(400, 'El proyecto no tiene clips en la línea de tiempo'); for (const s of p.segments) if (!getMedia(u, s.mediaId)) err(400, 'Clip con media inválida');
    for (const s of p.segments) { const mm = getMedia(u, s.mediaId); if (!mm.path && !(await getFile(mm.id))) missing(); }
    const id = enqueue(u, 'export', { name: p.name, segments: p.segments.length }, async prog => { const W = tier.width, H = tier.height; const files = [], durs = [];
      for (let i = 0; i < p.segments.length; i++) { const s = p.segments[i]; const m = getMedia(u, s.mediaId); if (!m.path) await ensureProbed(m);
        await withSource(m, (+s.in || 0) - 0.5, (+s.out || m.duration) + 0.5, async (src, base) => { const f = `/w/seg${i}.mp4`; durs.push(await renderSegment(src, { width: m.width, height: m.height, hasAudio: !!m.has_audio, duration: m.duration - base }, { ...s, in: (+s.in || 0) - base, out: (+s.out || m.duration) - base }, f, W, H, x => prog((i + x / 100) / p.segments.length * 55, `Renderizando clip ${i + 1}/${p.segments.length}`))); files.push(f); }); }
      const total = await joinSegments(files, durs, p.segments.map(s => s.transition), '/w/joined.mp4', x => prog(55 + x * 0.15, 'Aplicando transiciones'));
      for (const f of files) await rm(f);
      let music = null;
      if (p.music?.id) { if (p.music.id.startsWith('lib:')) music = { file: await ensureMusic(p.music.id.slice(4)), volume: p.music.volume, start: p.music.start };
        else { const mm = getMedia(u, p.music.id); if (mm) { const ff = await getFF(); await ff.writeFile('/w/music.bin', new Uint8Array(await (await getFile(mm.id)).arrayBuffer())); music = { file: '/w/music.bin', volume: p.music.volume, start: p.music.start }; } } }
      const sfxIds = (p.sfx || []).map(s => s.id).filter(id => L.SFX.find(x => x.id === id)); await ensureSfx(sfxIds);
      const sfx = (p.sfx || []).filter(s => sfxIds.includes(s.id)).map(s => ({ ...s, file: `/sfx/${s.id}.mp3` }));
      let assFile = null;
      if (p.autoSubs) { prog(71, 'Transcribiendo subtítulos con Whisper');
        try { const pcm = await extractPCM('/w/joined.mp4', total); const r = await transcribe(pcm, p.model || 'onnx-community/whisper-base_timestamped', p.lang || null, x => x >= 0 && prog(71 + x * 4, 'Transcribiendo subtítulos con Whisper'));
          if (r.words.length) assFile = await buildAss(r.words, '/w/subs.ass', p.subStyle || 'viral', { upper: true, posY: p.subY ?? 0.7 }); } catch (e) { console.warn(e); } }
      await finalPass('/w/joined.mp4', total, { texts: p.texts, assFile, watermark: tier.watermark, music, sfx, W, H, fps: tier.fps }, '/w/final.mp4', x => prog(75 + x * 0.24, 'Exportando video final'));
      const data = await readFile('/w/final.mp4'); await rm('/w/final.mp4'); await rm('/w/joined.mp4');
      const m = await registerMedia(u, new Blob([data], { type: 'video/mp4' }), (p.name || 'Proyecto') + ' (export).mp4', 'export', { tier: tier.name, duration: total });
      return { media: await mediaPub(m), quality: `${W}x${H} ${tier.fps}fps`, watermark: tier.watermark }; });
    return { jobId: id }; },
};
// Importar desde enlace: solo enlaces directos a archivos de video (YouTube/TikTok requieren un servidor)
async function importLink(u, url, prog) {
  if (!/^https?:\/\//i.test(url || '')) err(400, 'El enlace debe empezar por http(s)://');
  if (/youtu\.?be|tiktok\.com|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com/i.test(url)) err(400, 'En la app móvil no se pueden descargar videos de YouTube/TikTok/Instagram. Descárgalo en tu galería y súbelo desde «Subir archivo».');
  prog?.(2, 'Descargando video…'); let blob;
  if (Capacitor.isNativePlatform()) { const r = await CapacitorHttp.get({ url, responseType: 'blob' }); if (r.status >= 400) err(400, 'No se pudo descargar (' + r.status + ')');
    const bin = atob(r.data); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); blob = new Blob([a], { type: 'video/mp4' }); }
  else { const r = await fetch(url); if (!r.ok) err(400, 'No se pudo descargar (' + r.status + ')'); blob = await r.blob(); }
  return registerMedia(u, blob, decodeURIComponent(url.split('/').pop().split('?')[0] || 'video.mp4'), 'video');
}
export async function handle(method, path, body) {
  await load(); const p = path.split('?')[0];
  for (const [k, fn] of Object.entries(routes)) { const [m, pat] = k.split(' '); if (m !== method) continue;
    const names = []; const re = new RegExp('^' + pat.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$'); const mm = re.exec(p);
    if (mm) return fn(body || {}, Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(mm[i + 1])]))); }
  err(404, 'Ruta no encontrada: ' + p);
}
export async function getMediaBlob(id) { return getFile(id); }
export async function resetAll() { await load(); S = { users: [], usage: [], redemptions: [], owners: {}, payments: [], media: [], jobs: [], attempts: [] }; await kvSet('state', S); localStorage.removeItem('cliper.uid'); }
