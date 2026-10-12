// Análisis en el dispositivo: energía (ffmpeg→PCM), escenas + rostros (muestreo de fotogramas con <video> + MediaPipe), Whisper (worker)
import { exec, readFile, rm } from './ff.js';
import { Native, fileUrl, withProgress } from './native.js';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
let detector = null;
async function getDetector() {
  if (detector) return detector;
  const fs = await FilesetResolver.forVisionTasks(new URL('./mediapipe', location.href).href.replace(/\/$/, ''));
  detector = await FaceDetector.createFromOptions(fs, { baseOptions: { modelAssetPath: './assets/blaze_face_short_range.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.5 });
  return detector;
}
export async function extractPCM(src, dur, onP) {
  await exec(['-y', '-vn', '-sn', '-dn', '-i', src, '-map', '0:a:0', '-ac', '1', '-ar', '16000', '-f', 'f32le', '/w/a.pcm'], dur, onP && (p => onP(p / 100)));
  const b = await readFile('/w/a.pcm'); await rm('/w/a.pcm'); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}
async function sampleFrames(url, dur, onP, stepArg, check) {
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('El navegador no puede leer este video')); setTimeout(res, 8000); });
  const step = stepArg || (dur < 300 ? 0.5 : 1);
  const small = document.createElement('canvas'); small.width = 48; small.height = 27; const sc = small.getContext('2d', { willReadFrequently: true });
  const big = document.createElement('canvas'); const bw = 320; big.width = bw; big.height = Math.round(bw * (v.videoHeight || 9) / (v.videoWidth || 16)); const bc = big.getContext('2d');
  let det = null; try { det = await getDetector(); } catch (e) { console.warn('face', e); }
  const faces = [], diffs = []; let prev = null;
  for (let t = 0, i = 0; t < dur; t += step, i++) {
    await new Promise(res => { const done = () => { v.removeEventListener('seeked', done); res(); }; v.addEventListener('seeked', done); if (v.fastSeek && step > 1) v.fastSeek(Math.min(t, dur - 0.05)); else v.currentTime = Math.min(t, dur - 0.05); setTimeout(done, 1500); }); check?.();
    sc.drawImage(v, 0, 0, 48, 27); const px = sc.getImageData(0, 0, 48, 27).data;
    const hist = new Float32Array(48); for (let k = 0; k < px.length; k += 4) { hist[px[k] >> 4]++; hist[16 + (px[k + 1] >> 4)]++; hist[32 + (px[k + 2] >> 4)]++; }
    if (prev) { let d = 0; for (let k = 0; k < 48; k++) d += Math.abs(hist[k] - prev[k]); diffs.push({ t, d: d / (48 * 27 * 3 * 2) }); } prev = hist;
    if (det && (i % (step < 1 ? 2 : 1) === 0)) { bc.drawImage(v, 0, 0, big.width, big.height);
      const r = det.detect(big); const fs = (r.detections || []).map(d => d.boundingBox).filter(Boolean);
      if (fs.length) { const b = fs.reduce((a, x) => x.width * x.height > a.width * a.height ? x : a); faces.push({ t, x: (b.originX + b.width / 2) / big.width, s: b.width / big.width }); } }
    if (i % 10 === 0) { onP?.(t / dur); await new Promise(r => setTimeout(r, 0)); }
  }
  v.removeAttribute('src'); v.load();
  const ds = diffs.map(x => x.d).sort((a, b) => a - b); const thr = Math.max(0.35, ds[Math.floor(ds.length * 0.97)] || 1);
  const scenes = diffs.filter(x => x.d >= thr).map(x => x.t);
  return { scenes, faces };
}
let worker = null, wid = 0; const pending = new Set();
export function transcribe(audio, model, lang, onP) {
  worker ||= new Worker(new URL('./asr-worker.js', import.meta.url), { type: 'module' });
  const id = ++wid;
  return new Promise((res0, rej0) => { const res = v => { pending.delete(rej0); res0(v); }, rej = e => { pending.delete(rej0); rej0(e); }; pending.add(rej0); const h = ({ data }) => { if (data.id !== id) return;
      if (data.type === 'dl') onP?.(-1, data); if (data.type === 'progress') onP?.(data.progress);
      if (data.type === 'done') { worker.removeEventListener('message', h); res(data); } if (data.type === 'error') { worker.removeEventListener('message', h); rej(new Error(data.error)); } };
    worker.addEventListener('message', h); worker.postMessage({ id, audio, model, lang }); });
}
const HOOK = /(\?|!|secreto|nunca|siempre|increíble|mejor|peor|verdad|dinero|cómo|por qué|mira|atención|importante|nadie|todos|wow|never|best|secret|how|why|money|crazy|insane|\d+)/i;
// Encuadre que sigue el rostro: suaviza (mediana + media móvil) y deja keyframes cada ~1 s
export function faceTrack(faces, s0, s1) {
  const f = faces.filter(p => p.t >= s0 - 1 && p.t <= s1 + 1); if (!f.length) return null;
  const pts = []; for (let t = s0; t <= s1 + 0.01; t += 1) { const near = f.filter(p => Math.abs(p.t - t) <= 1.5).map(p => p.x).sort((a, b) => a - b);
    pts.push({ t, x: near.length ? near[Math.floor(near.length / 2)] : null }); }
  let last = pts.find(p => p.x != null)?.x ?? 0.5; for (const p of pts) { if (p.x == null) p.x = last; last = p.x; }
  const sm = pts.map((p, i) => { const w = pts.slice(Math.max(0, i - 1), i + 2); return { t: p.t, x: w.reduce((a, q) => a + q.x, 0) / w.length }; });
  // ignorar micro-movimientos (<4%) para que el encuadre sea estable
  for (let i = 1; i < sm.length; i++) if (Math.abs(sm[i].x - sm[i - 1].x) < 0.04) sm[i].x = sm[i - 1].x;
  return sm;
}
export function pickClips({ dur, energy: e, STEP, scenes, words, faces, N, MINL, MAXL }) {
  const segs = []; let cur = null;
  for (const w of words) { if (!cur) cur = { s: w.s, e: w.e, text: '' }; cur.text += (cur.text ? ' ' : '') + w.w; cur.e = w.e; if (/[.?!]$/.test(w.w) || cur.text.length > 140) { segs.push(cur); cur = null; } }
  if (cur) segs.push(cur);
  const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q / 100 * s.length))] ?? 0; };
  const score = (s0, s1) => { const seg = e.slice(Math.floor(s0 / STEP), Math.max(Math.floor(s0 / STEP) + 1, Math.floor(s1 / STEP))); if (!seg.length) return 0;
    const mean = seg.reduce((a, b) => a + b, 0) / seg.length; const sd = Math.sqrt(seg.reduce((a, b) => a + (b - mean) ** 2, 0) / seg.length);
    let sc = 0.5 * mean + 0.3 * pct(seg, 90) + 0.4 * sd; sc += Math.min(0.25, scenes.filter(x => x > s0 && x < s1).length * 0.04);
    const ws = words.filter(w => w.s >= s0 && w.s < s1);
    if (words.length) { sc += Math.min(0.3, ws.length / Math.max(1, s1 - s0) / 3 * 0.3); sc += Math.min(0.3, ws.filter(w => HOOK.test(w.w)).length * 0.03); if (ws.slice(0, 8).some(w => HOOK.test(w.w))) sc += 0.15;
      const silence = ws.length ? ws[0].s - s0 : s1 - s0; if (silence > 1.5) sc -= 0.1; }
    if (faces.length) sc += 0.1 * Math.min(1, faces.filter(f => f.t >= s0 && f.t <= s1).length / Math.max(1, (s1 - s0) / 2));
    return sc; };
  const sent = new Set(segs.length ? [segs[0].s, ...segs.slice(1).filter((s, i) => /[.?!]$/.test(segs[i].text)).map(s => s.s)] : []);
  const starts = [...new Set([...sent, ...segs.map(s => s.s), 0, ...scenes, ...Array.from({ length: Math.floor(dur / 2) }, (_, i) => i * 2)])].filter(s => s < dur - 1).sort((a, b) => a - b);
  const cands = [];
  for (const s0 of starts) for (let k = 0; k < 4; k++) { const L = MINL + (MAXL - MINL) * k / 3; let s1 = Math.min(dur, s0 + L); if (s1 - s0 < Math.min(MINL, dur * 0.9)) continue;
    const ends = segs.map(s => s.e).filter(x => x >= s0 + MINL * 0.8 && x <= s0 + MAXL); if (ends.length) s1 = Math.min(dur, ends.reduce((a, b) => Math.abs(b - (s0 + L)) < Math.abs(a - (s0 + L)) ? b : a) + 0.25);
    cands.push([score(s0, s1) + (sent.has(s0) ? 0.12 : 0), Math.max(0, s0 - 0.1), s1]); }
  cands.sort((a, b) => b[0] - a[0]); const chosen = [];
  for (const c of cands) { if (chosen.every(x => c[2] <= x[1] || c[1] >= x[2])) chosen.push(c); if (chosen.length >= N) break; }
  if (!chosen.length && dur > 0) chosen.push([0.5, 0, Math.min(dur, MAXL)]);
  const top = Math.max(...chosen.map(c => c[0]));
  return chosen.map(([sc, s0, s1]) => { const seg = e.slice(Math.floor(s0 / STEP), Math.floor(s1 / STEP)); const thr = pct(seg, 92); const peaks = [];
    seg.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).forEach(([v, i]) => { const t = i * STEP; if (v >= thr && t > 1 && peaks.length < 4 && peaks.every(p => Math.abs(t - p) > 4)) peaks.push(t); });
    const ws = words.filter(w => w.s >= s0 && w.s < s1).map(w => ({ ...w, s: w.s - s0, e: w.e - s0 })); const text = ws.map(w => w.w).join(' ');
    const first = (text.split(/(?<=[.?!])\s/)[0] || '').split(/\s+/).filter(Boolean);
    const title = text ? first.slice(0, 9).join(' ') + (first.length > 9 ? '…' : '') : `Momento destacado ${Math.floor(s0 / 60)}:${String(Math.floor(s0 % 60)).padStart(2, '0')}`;
    const track = faceTrack(faces, s0, s1); const fx = faces.filter(f => f.t >= s0 && f.t <= s1).map(f => f.x).sort((a, b) => a - b);
    return { start: s0, end: s1, score: Math.round(60 + 39 * sc / top), title, cropX: fx.length ? fx[Math.floor(fx.length / 2)] : 0.5, faceFound: !!fx.length, track, punchIns: peaks.sort((a, b) => a - b), words: ws, text }; })
    .sort((a, b) => b.score - a.score);
}
export function cancelAsr() { if (worker) { worker.terminate(); worker = null; } for (const r of pending) r(new Error('cancelled')); pending.clear(); }
// Rostros + escenas desde fotogramas ya extraídos por el código nativo (JPEG pequeños)
async function facesFromNativeFrames(list, onP, check) {
  let det = null; try { det = await getDetector(); } catch (e) { console.warn('face', e); }
  const faces = []; const ds = list.map(f => f.d).sort((a, b) => a - b); const thr = Math.max(0.35, ds[Math.floor(ds.length * 0.97)] || 1);
  const scenes = list.filter(f => f.d >= thr).map(f => f.t);
  if (det) for (let i = 0; i < list.length; i++) { check?.();
    const img = new Image(); img.src = fileUrl(list[i].file); try { await img.decode(); } catch { continue; }
    const r = det.detect(img); const fs = (r.detections || []).map(d => d.boundingBox).filter(Boolean);
    if (fs.length) { const b = fs.reduce((a, x) => x.width * x.height > a.width * a.height ? x : a); faces.push({ t: list[i].t, x: (b.originX + b.width / 2) / img.naturalWidth, s: b.width / img.naturalWidth }); }
    if (i % 10 === 0) { onP?.(i / list.length); await new Promise(r => setTimeout(r, 0)); } }
  return { scenes, faces };
}
const normEnergy = db => { const s = [...db].sort((a, b) => a - b); const mn = s[Math.floor(s.length * 0.02)] ?? 0, mx = s[Math.floor(s.length * 0.995)] ?? 1; return db.map(x => Math.max(0, Math.min(1, (x - mn) / (mx - mn + 1e-6)))); };
// Ventanas candidatas a transcribir (solo esas partes pasan por Whisper)
function windows(cands, dur, pad = 3) {
  const w = cands.map(c => [Math.max(0, c.start - pad), Math.min(dur, c.end + pad)]).sort((a, b) => a[0] - b[0]); const out = [];
  for (const x of w) { const l = out[out.length - 1]; if (l && x[0] <= l[1] + 1) l[1] = Math.max(l[1], x[1]); else out.push([...x]); }
  return out;
}
export async function analyzeVideo({ src, url, nativePath, meta, count, minLen, maxLen, whisper, model, lang }, onP, check = () => {}) {
  const dur = meta.duration; const STEP = 0.5; const long = dur > 240;
  // 1) Audio: nativo (MediaCodec) o wasm (solo pista de audio)
  onP(1, 'Analizando energía del audio'); let pcm = null, energy = [];
  if (meta.hasAudio) {
    if (nativePath) { const r = await withProgress('audio', () => Native.audio({ path: nativePath, mode: 'energy', step: STEP }), p => onP(1 + p * 0.12, 'Analizando energía del audio'));
      energy = r.noAudio ? [] : normEnergy(r.energy); }
    else { pcm = await extractPCM(src, dur, p => onP(1 + p * 0.12, 'Analizando energía del audio')); const hop = 16000 * STEP; const n = Math.max(1, Math.floor(pcm.length / hop)); const db = new Array(n);
      for (let i = 0; i < n; i++) { let s = 0; for (let k = i * hop, end = k + hop; k < end; k++) s += pcm[k] * pcm[k]; db[i] = 20 * Math.log10(Math.sqrt(s / hop + 1e-9) + 1e-6); }
      energy = normEnergy(db); } }
  if (!energy.length) energy = new Array(Math.max(1, Math.floor(dur / STEP))).fill(0);
  check();
  // 2) Escenas + rostros sobre un proxy de baja resolución / pocos fps
  const step = Math.max(0.5, dur / 900); // ≤ ~900 muestras aunque el video dure 1 h
  onP(13, 'Detectando escenas y rostros'); let scenes, faces;
  if (nativePath) { const fr = await withProgress('frames', () => Native.frames({ path: nativePath, step, duration: dur, width: 256 }), p => onP(13 + p * 0.12, 'Detectando escenas y rostros'));
    ({ scenes, faces } = await facesFromNativeFrames(fr.frames, p => onP(25 + p * 8, 'Detectando escenas y rostros'), check)); Native.deleteFile({ path: fr.dir }); }
  else ({ scenes, faces } = await sampleFrames(url, dur, p => onP(13 + p * 20, 'Detectando escenas y rostros'), step, check));
  check();
  // 3) Whisper solo en los momentos candidatos
  let words = [], language = null;
  if (whisper && meta.hasAudio) {
    const wins = long ? windows(pickClips({ dur, energy, STEP, scenes, words: [], faces, N: Math.min(14, count * 3 + 2), MINL: minLen, MAXL: maxLen }), dur) : [[0, dur]];
    const total = wins.reduce((a, w) => a + w[1] - w[0], 0); let done = 0;
    for (let wi = 0; wi < wins.length; wi++) { check(); const [a, b] = wins[wi];
      let audio; if (nativePath) { const r = await Native.audio({ path: nativePath, mode: 'pcm', start: a, end: b }); const buf = await (await fetch(fileUrl(r.file))).arrayBuffer(); Native.deleteFile({ path: r.file }); audio = new Float32Array(buf); }
      else audio = pcm.subarray(Math.floor(a * 16000), Math.floor(b * 16000));
      const label = wins.length > 1 ? `Transcribiendo momento ${wi + 1} de ${wins.length} (IA)` : 'Transcribiendo con Whisper (IA)';
      try { const r = await transcribe(audio, model, lang, (p, dl) => onP(p < 0 ? 34 : 36 + (done + p * (b - a)) / total * 50, p < 0 ? `Descargando modelo de IA (solo la 1ª vez) ${Math.round(dl.progress || 0)}%` : label));
        for (const w of r.words) { const s = w.s + a, e = w.e + a; if (words.length && s < words[words.length - 1].e - 0.05) continue; words.push({ s, e, w: w.w }); } language = r.lang; }
      catch (e) { if (String(e.message).includes('cancel')) throw e; console.warn('whisper', e); }
      done += b - a; }
    pcm = null;
  }
  check(); onP(87, 'Eligiendo los mejores momentos');
  const clips = pickClips({ dur, energy, STEP, scenes, words, faces, N: count, MINL: minLen, MAXL: maxLen });
  return { duration: dur, scenes, faces: faces.length, language, energy: energy.filter((_, i) => i % Math.max(2, Math.ceil(energy.length / 400)) === 0).map(x => +x.toFixed(3)), clips, words };
}
