// Port del motor de render del servidor a ffmpeg.wasm (rutas en el FS virtual)
import { getFF, exec, lastLogs, clearLogs } from './ff.js';
import { FILTERS, CINEMATIC, TEXT_ANIMATIONS, TEXT_STYLES } from './library.js';
const F = '/fonts';
const enc = (crf = 20) => ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100'];
let fileN = 0; const tmpName = ext => `/w/t${Date.now().toString(36)}${fileN++}.${ext}`;

export async function probe(path) {
  const f = await getFF(); clearLogs(); await f.exec(['-hide_banner', '-i', path]); const L = lastLogs();
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(L); const v = /Stream #.*Video: ([^,\s]+).*?, (\d{2,5})x(\d{2,5})/.exec(L);
  const rot = /rotation of (-?[\d.]+)/.exec(L);
  let w = v ? +v[2] : 0, h = v ? +v[3] : 0; if (rot && Math.abs(Math.round(+rot[1])) % 180 === 90) [w, h] = [h, w];
  return { duration: d ? (+d[1]) * 3600 + (+d[2]) * 60 + (+d[3]) : 0, width: w, height: h, hasVideo: !!v, vcodec: v?.[1], hasAudio: /Stream #.*Audio:/.test(L) };
}
const col = c => c ? '0x' + c.replace('#', '').padEnd(8, 'F').slice(0, 8) : null;
export function frameFilter(m, W, H, cropX = 0.5, fit = 'crop', zoom = 1) {
  if (fit === 'blur') return `split[bg][fg];[bg]scale=${W / 4}:${H / 4}:force_original_aspect_ratio=increase,crop=${W / 4}:${H / 4},gblur=sigma=8,scale=${W}:${H},eq=brightness=-0.08[bgb];[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`;
  if (fit === 'fit') return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;
  const ar = m.width / m.height, cx = Math.max(0, Math.min(1, cropX));
  const crop = ar > 9 / 16 ? `crop=w=trunc(ih*9/16/${zoom}/2)*2:h=trunc(ih/${zoom}/2)*2:x=(iw-ow)*${cx.toFixed(4)}:y=(ih-oh)/2`
    : `crop=w=trunc(iw/${zoom}/2)*2:h=trunc(iw*16/9/${zoom}/2)*2:x=(iw-ow)/2:y=(ih-oh)*0.4`;
  return `${crop},scale=${W}:${H}:flags=lanczos,setsar=1`;
}
// Encuadre dinámico: sigue el rostro con keyframes suavizados (expresión por tramos en x)
export function trackingCrop(m, W, H, track, zoom = 1) {
  if (!track?.length || m.width / m.height <= 9 / 16) return frameFilter(m, W, H, track?.[0]?.x ?? 0.5, 'crop', zoom);
  const pts = track.slice(0, 60); let expr = pts[pts.length - 1].x.toFixed(3);
  for (let i = pts.length - 2; i >= 0; i--) { const a = pts[i], b = pts[i + 1];
    expr = `if(lt(t,${b.t.toFixed(2)}),${a.x.toFixed(3)}+(${(b.x - a.x).toFixed(3)})*(t-${a.t.toFixed(2)})/${Math.max(0.01, b.t - a.t).toFixed(2)},${expr})`; }
  return `crop=w=trunc(ih*9/16/${zoom}/2)*2:h=trunc(ih/${zoom}/2)*2:x='(iw-ow)*max(0,min(1,${expr}))':y=(ih-oh)/2,scale=${W}:${H}:flags=lanczos,setsar=1`;
}
const atempo = s => { const f = []; while (s > 2) { f.push('atempo=2'); s /= 2; } while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; } f.push(`atempo=${s.toFixed(4)}`); return f.join(','); };
export function fxChain(filterId, cineIds = [], W = 1080, H = 1920) {
  const parts = []; const f = FILTERS.find(x => x.id === filterId); if (f?.ff) parts.push(f.ff);
  for (const id of cineIds || []) { const c = CINEMATIC.find(x => x.id === id); if (c) parts.push(c.ff.replace(/1080:1920/g, `${W}:${H}`).replace(/1080\*/g, `${W}*`)); }
  return parts;
}
export async function renderSegment(src, m, seg, out, W, H, onP) {
  const speed = Math.max(0.25, Math.min(4, +seg.speed || 1)); const inT = Math.max(0, +seg.in || 0), outT = Math.min(m.duration, +seg.out || m.duration); const d = (outT - inT) / speed;
  const vf = [frameFilter(m, W, H, seg.cropX ?? 0.5, seg.fit || 'crop', seg.zoom || 1), `setpts=(PTS-STARTPTS)/${speed}`, ...fxChain(seg.filter, seg.cinematic, W, H), 'fps=30', 'format=yuv420p'];
  if (seg.reverse) vf.splice(1, 0, 'reverse');
  const args = ['-y', '-ss', String(inT), '-to', String(outT), '-i', src]; let af;
  if (m.hasAudio && !seg.mute) af = `[0:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,${atempo(speed)},volume=${seg.volume ?? 1}${seg.reverse ? ',areverse' : ''}[a]`;
  else { args.push('-f', 'lavfi', '-t', String(d), '-i', 'anullsrc=r=44100:cl=stereo'); af = '[1:a]anull[a]'; }
  args.push('-filter_complex', `[0:v]${vf.join(',')}[v];${af}`, '-map', '[v]', '-map', '[a]', '-t', String(d), ...enc(18), out);
  await exec(args, d, onP); return d;
}
export async function joinSegments(files, durs, transitions, out, onP) {
  const f = await getFF();
  if (files.length === 1) { await f.rename(files[0], out); return durs[0]; }
  const args = ['-y']; files.forEach(x => args.push('-i', x));
  let fc = '', vP = '[0:v]', aP = '[0:a]', total = durs[0];
  for (let i = 1; i < files.length; i++) { const t = transitions[i - 1] || { type: 'none' };
    const td = t.type && t.type !== 'none' ? Math.min(+t.dur || 0.5, durs[i - 1] * 0.45, durs[i] * 0.45) : 0; const vo = `[v${i}]`, ao = `[a${i}]`;
    if (td > 0.04) { fc += `${vP}[${i}:v]xfade=transition=${t.type}:duration=${td.toFixed(3)}:offset=${(total - td).toFixed(3)}${vo};${aP}[${i}:a]acrossfade=d=${td.toFixed(3)}${ao};`; total += durs[i] - td; }
    else { fc += `${vP}${aP}[${i}:v][${i}:a]concat=n=2:v=1:a=1${vo}${ao};`; total += durs[i]; }
    vP = vo; aP = ao; }
  args.push('-filter_complex', fc.replace(/;$/, ''), '-map', vP, '-map', aP, ...enc(18), out);
  await exec(args, total, onP); return total;
}
export async function drawTextFilter(t, idx, W = 1080) {
  const f = await getFF(); const k = W / 1080;
  const st = TEXT_STYLES.find(s => s.id === t.style) || TEXT_STYLES[0]; const an = TEXT_ANIMATIONS.find(a => a.id === t.anim) || TEXT_ANIMATIONS[0];
  const S = (+t.start || 0).toFixed(3), E = (+t.end || 3).toFixed(3); const sub = x => x.replace(/\bS\b/g, S).replace(/\bE\b/g, E);
  const size = Math.round((+t.size || 72) * k); const xr = t.x ?? 0.5, yr = t.y ?? 0.5;
  const lines = String(t.upper ? String(t.text).toUpperCase() : t.text).split('\n').filter(l => l.trim()); const lh = Math.round(size * (st.box ? 1.6 : 1.22)); const tot = lh * lines.length;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const tf = `/w/txt${idx}_${i}.txt`; await f.writeFile(tf, new TextEncoder().encode(lines[i]));
    const o = [`fontfile=${F}/${t.font || st.font}.ttf`, `textfile=${tf}`, `fontsize=${size}`, `fontcolor=${col(t.color || st.color)}`,
      `x='(w-tw)*${xr}+(${sub(an.dx)})*${k.toFixed(3)}'`, `y='(h-${tot})*${yr}+${i * lh}+(${lh}-th)/2+(${sub(an.dy)})*${k.toFixed(3)}'`, `alpha='max(0,min(1,${sub(an.alpha)}))'`, `enable='between(t,${S},${E})'`];
    if (st.stroke) o.push(`borderw=${Math.max(1, Math.round(st.strokeW * size / 72))}`, `bordercolor=${col(st.stroke)}`);
    if (st.box) o.push('box=1', `boxcolor=${col(st.box)}`, `boxborderw=${Math.round(size * 0.3)}`); else o.push(`shadowx=${Math.round(3 * k)}`, `shadowy=${Math.round(4 * k)}`, 'shadowcolor=0x00000088');
    out.push('drawtext=' + o.join(':'));
  }
  return out.join(',') || 'null';
}
export const watermarkFilter = W => `drawtext=fontfile=${F}/Poppins-Black.ttf:text='Cliper':fontsize=${Math.round(46 * W / 1080)}:fontcolor=white@0.55:x=w-tw-${Math.round(40 * W / 1080)}:y=h-th-${Math.round(150 * W / 1080)}:shadowx=2:shadowy=2:shadowcolor=black@0.5`;

const SUB_STYLES = {
  viral: { font: 'Poppins Black', size: 108, primary: '&H00FFFFFF', hi: '&H0000E6FF', outline: '&H00000000', ow: 6, box: false },
  neon: { font: 'Bangers', size: 116, primary: '&H00FFFFFF', hi: '&H00B32FFF', outline: '&H00300030', ow: 6, box: false },
  boxed: { font: 'Poppins Black', size: 94, primary: '&H00FFFFFF', hi: '&H003CFF7A', outline: '&H64000000', ow: 18, box: true },
  minimal: { font: 'Poppins Bold', size: 74, primary: '&H00FFFFFF', hi: '&H00FFFFFF', outline: '&H00000000', ow: 3, box: false },
  impact: { font: 'Anton', size: 120, primary: '&H00FFFFFF', hi: '&H003B3BFF', outline: '&H00000000', ow: 7, box: false },
};
export const SUB_STYLE_IDS = Object.keys(SUB_STYLES);
const assT = t => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = (t % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${s}`; };
// PlayRes fijo 1080x1920: libass escala al tamaño real
export async function buildAss(words, file, styleId = 'viral', { upper = true, perChunk = 3, posY = 0.68 } = {}) {
  const st = SUB_STYLES[styleId] || SUB_STYLES.viral;
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: S,${st.font},${st.size},${st.primary},${st.hi},${st.outline},&H96000000,-1,0,0,0,100,100,1,0,${st.box ? 3 : 1},${st.ow},${st.box ? 0 : 3},2,60,60,${Math.round(1920 * (1 - posY))},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const ws = words.filter(w => w.e > 0 && w.w); const lines = [];
  // agrupa por pausas y puntuación (máx perChunk palabras, ~18 caracteres)
  const chunks = []; let c = [];
  for (const w of ws) { const len = c.reduce((a, x) => a + x.w.length + 1, 0);
    if (c.length && (c.length >= perChunk || len + w.w.length > 18 || w.s - c[c.length - 1].e > 0.6)) { chunks.push(c); c = []; }
    c.push(w); if (/[.?!,]$/.test(w.w)) { chunks.push(c); c = []; } }
  if (c.length) chunks.push(c);
  chunks.forEach((ch, ci) => { const chEnd = chunks[ci + 1]?.[0].s ?? ch[ch.length - 1].e + 0.4;
    ch.forEach((w, k) => { const s = w.s, e = k < ch.length - 1 ? ch[k + 1].s : Math.min(chEnd, w.e + 0.6); if (e <= s) return;
      const txt = ch.map((x, j) => { let tx = (upper ? x.w.toUpperCase() : x.w).replace(/[{}\\]/g, '');
        return j === k ? `{\\c${st.hi}\\fscx112\\fscy112\\t(0,80,\\fscx120\\fscy120)\\t(80,170,\\fscx110\\fscy110)}${tx}{\\c${st.primary}\\fscx100\\fscy100}` : tx; }).join(' ');
      lines.push(`Dialogue: 0,${assT(s)},${assT(e)},S,,0,0,0,,${k === 0 ? '{\\fad(60,0)}' : ''}${txt}`); }); });
  const f = await getFF(); await f.writeFile(file, new TextEncoder().encode(head + lines.join('\n') + '\n')); return file;
}
export async function finalPass(input, dur, opts, out, onP) {
  const { texts = [], assFile, watermark, music, sfx = [], W, H, fps = 30 } = opts;
  const args = ['-y', '-i', input]; const vf = [];
  if (assFile) vf.push(`subtitles=${assFile}:fontsdir=${F}`);
  for (let i = 0; i < texts.length; i++) if (texts[i].text) vf.push(await drawTextFilter(texts[i], i, W));
  if (watermark) vf.push(watermarkFilter(W));
  vf.push(`fps=${fps}`, 'format=yuv420p');
  let fc = `[0:v]${vf.join(',')}[v]`; const amix = ['[0:a]']; let k = 1;
  if (music?.file) { args.push('-stream_loop', '-1', '-i', music.file); const ms = Math.round((music.start || 0) * 1000);
    fc += `;[${k}:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${ms}|${ms},volume=${music.volume ?? 0.4},afade=t=out:st=${Math.max(0, dur - 1.5).toFixed(2)}:d=1.5[m]`; amix.push('[m]'); k++; }
  for (const s of sfx) { if (!s.file) continue; args.push('-i', s.file); const ms = Math.round((s.at || 0) * 1000); fc += `;[${k}:a]adelay=${ms}|${ms},volume=${s.volume ?? 0.8}[s${k}]`; amix.push(`[s${k}]`); k++; }
  fc += amix.length > 1 ? `;${amix.join('')}amix=inputs=${amix.length}:duration=first:normalize=0,alimiter=limit=0.95[a]` : ';[0:a]anull[a]';
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3), ...enc(20), '-movflags', '+faststart', out);
  await exec(args, dur, onP);
}
const GRADES = { viral: 'eq=contrast=1.08:saturation=1.18,unsharp=5:5:0.6', cinematic: 'colorbalance=rs=.12:bs=-.12:rh=-.08:bh=.12,eq=contrast=1.12:saturation=1.1,vignette=PI/5', clean: 'eq=contrast=1.03:saturation=1.05', moody: 'eq=brightness=-0.05:saturation=0.8:contrast=1.15,vignette=PI/4', vibrant: 'eq=saturation=1.45:contrast=1.12' };
export async function renderAiClip(src, m, clip, o, out, onP) {
  const { W, H } = o; const dur = clip.end - clip.start;
  const pi = o.punchIns !== false ? clip.punchIns.filter(t => t < dur - 1) : [];
  const zoomExpr = pi.length ? pi.map(t => `between(t,${t.toFixed(2)},${(t + 1.4).toFixed(2)})`).join('+') : '0';
  const track = (clip.track || []).map(p => ({ t: p.t - clip.start, x: p.x })).filter(p => p.t >= -1 && p.t <= dur + 1);
  const vf = [o.fit === 'crop' || !o.fit ? trackingCrop(m, W, H, track.length ? track : [{ t: 0, x: clip.cropX }]) : frameFilter(m, W, H, clip.cropX, o.fit)];
  vf.push(`scale=w='2*trunc(${W}*(1.0+0.04*t/${dur.toFixed(2)}+0.14*(${zoomExpr}))/2)':h=-2:eval=frame`, `crop=${W}:${H}`);
  vf.push(GRADES[o.grade] || GRADES.viral, 'fade=t=in:st=0:d=0.25');
  if (o.captions !== false && clip.words?.length) { const ass = tmpName('ass'); await buildAss(clip.words, ass, o.subStyle || 'viral', { upper: o.upper !== false }); vf.push(`subtitles=${ass}:fontsdir=${F}`); }
  if (o.hookTitle !== false && clip.title) {
    const words = clip.title.replace(/…$/, '').split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 20 && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
    if (cur) lines.push(cur);
    vf.push(await drawTextFilter({ text: lines.slice(0, 3).join('\n') + (lines.length > 3 ? '…' : ''), start: 0.2, end: Math.min(3.2, dur), x: 0.5, y: 0.13, size: 62, style: 'boxed_white', anim: 'pop', upper: false }, 'hook', W));
  }
  const barH = Math.round(14 * W / 1080);
  if (o.watermark) vf.push(watermarkFilter(W));
  vf.push(`fps=${o.fps || 30}`, 'format=yuv420p');
  const args = ['-y', '-ss', clip.start.toFixed(3), '-to', clip.end.toFixed(3), '-i', src];
  const vchain = vf.join(',');
  let fc = o.progressBar !== false ? `[0:v]${vchain}[vb];color=c=0xFFE600:s=${W}x${barH}:r=${o.fps || 30}[bar];[vb][bar]overlay=x='-W+W*t/${dur.toFixed(2)}':y=H-h:shortest=1,format=yuv420p[v]` : `[0:v]${vchain}[v]`; const mix = [];
  if (m.hasAudio) { fc += ';[0:a]aresample=44100,aformat=channel_layouts=stereo,asetpts=PTS-STARTPTS,dynaudnorm=f=150:g=15,afade=t=in:d=0.15[a0]'; }
  else { args.push('-f', 'lavfi', '-t', dur.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo'); fc += ';[1:a]anull[a0]'; }
  mix.push('[a0]'); let k = m.hasAudio ? 1 : 2;
  if (o.sfx !== false) for (const h of [{ id: 'pop', at: 0.2, v: 0.5 }, ...pi.map(t => ({ id: 'whoosh', at: Math.max(0, t - 0.25), v: 0.35 }))]) {
    args.push('-i', `/sfx/${h.id}.mp3`); const ms = Math.round(h.at * 1000); fc += `;[${k}:a]adelay=${ms}|${ms},volume=${h.v}[s${k}]`; mix.push(`[s${k}]`); k++; }
  fc += mix.length > 1 ? `;${mix.join('')}amix=inputs=${mix.length}:duration=first:normalize=0,alimiter=limit=0.95[a]` : ';[a0]anull[a]';
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(3), ...enc(20), '-movflags', '+faststart', out);
  await exec(args, dur, onP);
}
export async function ensureSfx(ids) { const f = await getFF(); await f.createDir('/sfx').catch(() => {});
  for (const id of new Set(ids)) { try { await f.readFile(`/sfx/${id}.mp3`); } catch { await f.writeFile(`/sfx/${id}.mp3`, new Uint8Array(await (await fetch(`./assets/sfx/${id}.mp3`)).arrayBuffer())); } } }
export async function ensureMusic(id) { const f = await getFF(); await f.createDir('/music').catch(() => {}); const p = `/music/${id}.mp3`;
  try { await f.readFile(p); } catch { await f.writeFile(p, new Uint8Array(await (await fetch(`./assets/music/${id}.mp3`)).arrayBuffer())); } return p; }
