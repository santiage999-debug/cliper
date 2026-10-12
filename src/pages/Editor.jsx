import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { api, uploadFile, pollJob, fmt, isNativeApp, chooseFile } from '../api.js'; import { useApp } from '../App.jsx'; import { Toggle, Seg, SaveButtons } from './common.jsx';
import { cineClass, styleCss, useSfxPlayer } from './Library.jsx';
import { Play, Pause, Scissors, Trash2, Copy, ChevronLeft, ChevronRight, Type, Upload, Link2, Download, ZoomIn, ZoomOut, SkipBack, Music, Volume2, Plus, Film, Undo2 } from 'lucide-react';
const uid = () => Math.random().toString(36).slice(2, 9);
const LS = 'cliper.project.v1';
const blank = () => ({ name: 'Mi reel', segments: [], texts: [], sfx: [], music: null, autoSubs: false, subStyle: 'viral' });
const segDur = s => (s.out - s.in) / (s.speed || 1);
function layout(segs) { let t = 0; return segs.map((s, i) => { const d = segDur(s); let start = t;
  if (i > 0) { const tr = segs[i - 1].transition; const td = tr && tr.type !== 'none' ? Math.min(tr.dur || 0.5, segDur(segs[i - 1]) * 0.45, d * 0.45) : 0; start = t - td; }
  t = start + d; return { start, end: t, d }; }); }

const useMobile = () => { const [m, setM] = useState(() => matchMedia('(max-width:820px)').matches); useEffect(() => { const q = matchMedia('(max-width:820px)'); const f = () => setM(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []); return m; };
export default function Editor() {
  const mobile = useMobile();
  const { lib, notify, editorLoad, setEditorLoad, user, refresh } = useApp();
  const [p, setP] = useState(() => { try { return JSON.parse(localStorage.getItem(LS)) || blank(); } catch { return blank(); } });
  const [hist, setHist] = useState([]);
  const [media, setMedia] = useState([]); const [tab, setTab] = useState('media'); const [sel, setSel] = useState(null); // {type:'seg'|'text'|'sfx', id}
  const tabRef = useRef(tab); tabRef.current = tab;
  const [t, setT] = useState(0);
  useEffect(() => { if (mobile && sel && tabRef.current !== 'audio') setTab('props'); }, [sel?.id]); const [playing, setPlaying] = useState(false); const [pps, setPps] = useState(40);
  const [exp, setExp] = useState(null); const [upl, setUpl] = useState(null); const [link, setLink] = useState('');
  const vid = useRef(); const stage = useRef(); const raf = useRef(); const tRef = useRef(0); const [stageH, setStageH] = useState(600);
  const [cur, playSfx] = useSfxPlayer();
  const L = useMemo(() => layout(p.segments), [p.segments]); const total = L.length ? L[L.length - 1].end : 0;
  const upd = useCallback((fn, snap = true) => setP(prev => { if (snap) setHist(h => [...h.slice(-40), prev]); const n = typeof fn === 'function' ? fn(structuredClone(prev)) : fn; return n; }), []);
  useEffect(() => { localStorage.setItem(LS, JSON.stringify(p)); }, [p]);
  const loadMedia = () => api('/api/media').then(r => setMedia(r.media)); useEffect(() => { loadMedia(); }, []);
  useEffect(() => { const ro = new ResizeObserver(() => stage.current && setStageH(stage.current.clientHeight)); stage.current && ro.observe(stage.current); return () => ro.disconnect(); }, []);
  const addSeg = m => { if (m.kind === 'audio') { upd(d => { d.music = { id: m.id, name: m.name, url: m.url, volume: 0.5, start: 0 }; return d; }); notify('Audio añadido como música'); return; }
    upd(d => { d.segments.push({ uid: uid(), mediaId: m.id, url: m.url, thumbUrl: m.thumbUrl, name: m.name, srcDur: m.duration, width: m.width, height: m.height, in: 0, out: m.duration, speed: 1, cropX: m.meta?.cropX ?? 0.5, fit: m.width / m.height < 0.6 ? 'fit' : 'crop', filter: 'none', cinematic: [], transition: { type: 'none', dur: 0.5 }, volume: 1, mute: false }); return d; }); };
  useEffect(() => { if (editorLoad) { addSeg(editorLoad); setEditorLoad(null); notify('Clip añadido a la línea de tiempo'); } }, [editorLoad]);

  // ---------- reproducción ----------
  const locate = tt => { for (let i = L.length - 1; i >= 0; i--) if (tt >= L[i].start) return { i, local: Math.min(tt - L[i].start, L[i].d) }; return { i: 0, local: 0 }; };
  const segAt = locate(t); const curSeg = p.segments[segAt.i];
  const syncVideo = (tt, play) => { const v = vid.current; if (!v || !p.segments.length) return; const { i, local } = locate(tt); const s = p.segments[i];
    if (!v.src.endsWith(s.url)) { v.src = s.url; } const target = s.in + local * s.speed; if (Math.abs(v.currentTime - target) > 0.15) v.currentTime = target;
    v.playbackRate = s.speed; v.muted = s.mute; v.volume = Math.min(1, s.volume); v.dataset.seg = i; if (play) v.play().catch(() => {}); };
  const seek = tt => { tt = Math.max(0, Math.min(total, tt)); tRef.current = tt; setT(tt); syncVideo(tt, playing); };
  const music = useRef(new Audio()); const sfxPlayed = useRef(new Set());
  const play = () => { if (!p.segments.length) return; let start = tRef.current >= total - 0.05 ? 0 : tRef.current; tRef.current = start; setPlaying(true); syncVideo(start, true);
    if (p.music?.url || p.music?.id?.startsWith('lib:')) { const m = music.current; m.src = p.music.url; m.volume = Math.min(1, p.music.volume ?? .5); m.currentTime = Math.max(0, start - (p.music.start || 0)) % 30; m.loop = true; m.play().catch(() => {}); }
    sfxPlayed.current = new Set(p.sfx.filter(s => s.at < start).map(s => s.uid)); };
  const pause = () => { setPlaying(false); vid.current?.pause(); music.current.pause(); cancelAnimationFrame(raf.current); };
  useEffect(() => { if (!playing) return; const tick = () => { const v = vid.current; const i = +v.dataset.seg || 0; const s = p.segments[i]; if (!s) return pause();
      let tt = L[i].start + (v.currentTime - s.in) / s.speed;
      if (v.currentTime >= s.out - 0.03 || v.ended) { if (i + 1 < p.segments.length) { tt = L[i + 1].start + 0.001; syncVideo(tt, true); } else { tRef.current = total; setT(total); return pause(); } }
      tRef.current = tt; setT(tt);
      for (const x of p.sfx) if (!sfxPlayed.current.has(x.uid) && tt >= x.at) { sfxPlayed.current.add(x.uid); const a = new Audio(lib.sfx.find(z => z.id === x.id)?.url); a.volume = Math.min(1, x.volume ?? .8); a.play().catch(() => {}); }
      raf.current = requestAnimationFrame(tick); }; raf.current = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf.current); }, [playing, p, L]);
  useEffect(() => { if (!playing) syncVideo(tRef.current, false); }, [p.segments, L]);

  // ---------- acciones ----------
  const selSeg = sel?.type === 'seg' ? p.segments.find(s => s.uid === sel.id) : null;
  const selText = sel?.type === 'text' ? p.texts.find(s => s.uid === sel.id) : null;
  const selSfx = sel?.type === 'sfx' ? p.sfx.find(s => s.uid === sel.id) : null;
  const target = selSeg || curSeg; // destino de filtros/efectos
  const setSegProp = (k, v, u = target?.uid) => upd(d => { const s = d.segments.find(x => x.uid === u); if (s) s[k] = v; return d; });
  const split = () => { const { i, local } = locate(tRef.current); const s = p.segments[i]; if (!s) return; const at = s.in + local * s.speed; if (at - s.in < 0.2 || s.out - at < 0.2) return notify('Mueve el cabezal dentro de un clip', 'bad');
    upd(d => { const a = d.segments[i]; const b = { ...structuredClone(a), uid: uid(), in: at }; a.out = at; a.transition = { type: 'none', dur: 0.5 }; d.segments.splice(i + 1, 0, b); return d; }); notify('Clip dividido ✂'); };
  const del = () => { if (!sel) return; upd(d => { const k = { seg: 'segments', text: 'texts', sfx: 'sfx' }[sel.type]; d[k] = d[k].filter(x => x.uid !== sel.id); return d; }); setSel(null); };
  const dup = () => { if (!selSeg) return; upd(d => { const i = d.segments.findIndex(x => x.uid === sel.id); d.segments.splice(i + 1, 0, { ...structuredClone(d.segments[i]), uid: uid() }); return d; }); };
  const move = dir => { if (!selSeg) return; upd(d => { const i = d.segments.findIndex(x => x.uid === sel.id); const j = i + dir; if (j < 0 || j >= d.segments.length) return d; [d.segments[i], d.segments[j]] = [d.segments[j], d.segments[i]]; return d; }); };
  const undo = () => { setHist(h => { if (!h.length) return h; setP(h[h.length - 1]); return h.slice(0, -1); }); };
  const addText = (style = 'classic', anim = 'pop') => { const id = uid(); upd(d => { d.texts.push({ uid: id, text: 'Escribe aquí', start: +tRef.current.toFixed(2), end: +Math.min(tRef.current + 3, Math.max(total, 3)).toFixed(2), x: 0.5, y: 0.3, size: 84, style, anim, upper: true }); return d; }); setSel({ type: 'text', id }); };
  const addSfx = s => { const id = uid(); upd(d => { d.sfx.push({ uid: id, id: s.id, name: s.name, at: +tRef.current.toFixed(2), volume: 0.8 }); return d; }); setSel({ type: 'sfx', id }); notify(`SFX «${s.name}» en ${fmt(tRef.current)}`); };
  useEffect(() => { const k = e => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return; if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); } if (e.key === 's' || e.key === 'S') split(); if (e.key === 'Delete' || e.key === 'Backspace') del(); if ((e.ctrlKey || e.metaKey) && e.key === 'z') undo(); if (e.key === 'ArrowLeft') seek(tRef.current - 1 / 30 * (e.shiftKey ? 30 : 1)); if (e.key === 'ArrowRight') seek(tRef.current + 1 / 30 * (e.shiftKey ? 30 : 1)); };
    addEventListener('keydown', k); return () => removeEventListener('keydown', k); });

  const doUpload = async f => { try { setUpl(0); const m = await uploadFile(f, setUpl); setUpl(null); await loadMedia(); addSeg(m); notify('Subido: ' + m.name); } catch (e) { setUpl(null); notify(e.message, 'bad'); } };
  const doLink = async () => { try { const r = await api('/api/media/link', { method: 'POST', body: { url: link } }); setUpl(1); const j = await pollJob(r.jobId, j => setUpl(j.progress)); setUpl(null); setLink(''); await loadMedia(); addSeg(j.result.media); } catch (e) { setUpl(null); notify(e.message, 'bad'); } };
  const doExport = async () => { if (!p.segments.length) return notify('Añade al menos un clip', 'bad'); pause();
    try { const r = await api('/api/export', { method: 'POST', body: { project: p } }); setExp({ job: { progress: 0, msg: 'En cola…' } }); const j = await pollJob(r.jobId, job => setExp({ job })); setExp({ job: j, done: j.result }); loadMedia(); notify('¡Exportado! ' + j.result.quality); }
    catch (e) { setExp({ error: e.message }); notify(e.message, 'bad'); } };

  // ---------- render ----------
  const sc = stageH / 1920; const activeTexts = p.texts.filter(x => t >= x.start && t <= x.end);
  const f = lib?.filters.find(x => x.id === curSeg?.filter); const grades = (curSeg?.cinematic || []).map(id => lib?.cinematic.find(c => c.id === id)).filter(Boolean);
  const cssFilter = [f?.css, ...grades.filter(g => g.kind === 'grade').map(g => g.css)].filter(Boolean).join(' ');
  const fxClasses = grades.filter(g => g.kind !== 'grade').map(cineClass).join(' ');
  const dragText = (e, tx) => { e.stopPropagation(); setSel({ type: 'text', id: tx.uid }); const r = stage.current.getBoundingClientRect(); let first = true;
    const mv = ev => { upd(d => { const o = d.texts.find(x => x.uid === tx.uid); o.x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)); o.y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height)); return d; }, first); first = false; };
    const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); }; addEventListener('pointermove', mv); addEventListener('pointerup', upf); };
  const dragItem = (e, kind, it) => { e.stopPropagation(); setSel({ type: kind, id: it.uid }); const x0 = e.clientX; const s0 = kind === 'text' ? it.start : it.at; const len = kind === 'text' ? it.end - it.start : 0; let first = true;
    const mv = ev => { const ns = Math.max(0, +(s0 + (ev.clientX - x0) / pps).toFixed(2)); upd(d => { const o = d[kind === 'text' ? 'texts' : 'sfx'].find(x => x.uid === it.uid); if (kind === 'text') { o.start = ns; o.end = +(ns + len).toFixed(2); } else o.at = ns; return d; }, first); first = false; };
    const upf = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', upf); }; addEventListener('pointermove', mv); addEventListener('pointerup', upf); };
  const tlWidth = Math.max(total + 5, 30) * pps;
  if (!lib) return null;
  const inspector = <>
      {selSeg && <div className="col">
        <div className="h3" style={{ margin: 0 }}>Clip {p.segments.indexOf(selSeg) + 1}</div>
        <div className="muted" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{selSeg.name}</div>
        <div><label className="lb">Inicio {fmt(selSeg.in)}</label><input type="range" min={0} max={selSeg.srcDur} step={0.05} value={selSeg.in} onChange={e => setSegProp('in', Math.min(+e.target.value, selSeg.out - 0.2), selSeg.uid)} /></div>
        <div><label className="lb">Fin {fmt(selSeg.out)}</label><input type="range" min={0} max={selSeg.srcDur} step={0.05} value={selSeg.out} onChange={e => setSegProp('out', Math.max(+e.target.value, selSeg.in + 0.2), selSeg.uid)} /></div>
        <div><label className="lb">Velocidad {selSeg.speed}x</label><Seg v={selSeg.speed} set={v => setSegProp('speed', v, selSeg.uid)} opts={[[0.25, '.25'], [0.5, '.5'], [1, '1x'], [1.5, '1.5'], [2, '2x'], [3, '3x']]} /></div>
        <div><label className="lb">Encuadre 9:16</label><Seg v={selSeg.fit} set={v => setSegProp('fit', v, selSeg.uid)} opts={[['crop', 'Recortar'], ['blur', 'Fondo blur'], ['fit', 'Ajustar']]} /></div>
        {selSeg.fit === 'crop' && <div><label className="lb">Posición horizontal del recorte {Math.round(selSeg.cropX * 100)}%</label><input type="range" min={0} max={1} step={0.01} value={selSeg.cropX} onChange={e => setSegProp('cropX', +e.target.value, selSeg.uid)} /></div>}
        <div><label className="lb">Zoom {(selSeg.zoom || 1).toFixed(2)}x</label><input type="range" min={1} max={2} step={0.05} value={selSeg.zoom || 1} onChange={e => setSegProp('zoom', +e.target.value, selSeg.uid)} /></div>
        <div><label className="lb"><Volume2 size={12} /> Volumen {Math.round(selSeg.volume * 100)}%</label><input type="range" min={0} max={2} step={0.05} value={selSeg.volume} onChange={e => setSegProp('volume', +e.target.value, selSeg.uid)} /></div>
        <Toggle on={selSeg.mute} set={v => setSegProp('mute', v, selSeg.uid)}>Silenciar audio</Toggle>
        <Toggle on={!!selSeg.reverse} set={v => setSegProp('reverse', v, selSeg.uid)}>Reproducir al revés (export)</Toggle>
        <div className="muted" style={{ fontSize: 12 }}>Filtro: <b>{lib.filters.find(x => x.id === selSeg.filter)?.name}</b> · Efectos: {selSeg.cinematic.length} · Transición: {lib.transitions.find(x => x.id === selSeg.transition.type)?.name}</div>
      </div>}
      {selText && <div className="col">
        <div className="h3" style={{ margin: 0 }}>Texto</div>
        <textarea className="inp" rows={3} value={selText.text} onChange={e => upd(d => { d.texts.find(x => x.uid === selText.uid).text = e.target.value; return d; }, false)} />
        <div className="row"><div style={{ flex: 1 }}><label className="lb">Desde (s)</label><input className="inp" type="number" step={0.1} value={selText.start} onChange={e => upd(d => { d.texts.find(x => x.uid === selText.uid).start = +e.target.value; return d; }, false)} /></div><div style={{ flex: 1 }}><label className="lb">Hasta (s)</label><input className="inp" type="number" step={0.1} value={selText.end} onChange={e => upd(d => { d.texts.find(x => x.uid === selText.uid).end = +e.target.value; return d; }, false)} /></div></div>
        <div><label className="lb">Tamaño {selText.size}</label><input type="range" min={30} max={200} value={selText.size} onChange={e => upd(d => { d.texts.find(x => x.uid === selText.uid).size = +e.target.value; return d; }, false)} /></div>
        <Toggle on={selText.upper} set={v => upd(d => { d.texts.find(x => x.uid === selText.uid).upper = v; return d; })}>MAYÚSCULAS</Toggle>
        <div className="muted" style={{ fontSize: 12 }}>Arrastra el texto en la pantalla para moverlo. Estilo y animación en la pestaña «Texto».</div>
      </div>}
      {selSfx && <div className="col"><div className="h3" style={{ margin: 0 }}>🔊 {selSfx.name}</div>
        <div><label className="lb">Momento (s)</label><input className="inp" type="number" step={0.05} value={selSfx.at} onChange={e => upd(d => { d.sfx.find(x => x.uid === selSfx.uid).at = +e.target.value; return d; }, false)} /></div>
        <div><label className="lb">Volumen {Math.round(selSfx.volume * 100)}%</label><input type="range" min={0} max={2} step={0.05} value={selSfx.volume} onChange={e => upd(d => { d.sfx.find(x => x.uid === selSfx.uid).volume = +e.target.value; return d; }, false)} /></div></div>}
      {!sel && <div className="col">
        <div className="h3" style={{ margin: 0 }}>Proyecto</div>
        <input className="inp" value={p.name} onChange={e => upd(d => { d.name = e.target.value; return d; }, false)} />
        <Toggle on={p.autoSubs} set={v => upd(d => { d.autoSubs = v; return d; })}>Subtítulos automáticos (Whisper)</Toggle>
        {p.autoSubs && <Seg v={p.subStyle} set={v => upd(d => { d.subStyle = v; return d; })} opts={lib.subStyles.map(s => [s, s[0].toUpperCase() + s.slice(1)])} />}
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>{p.segments.length} clips · {p.texts.length} textos · {p.sfx.length} SFX · {fmt(total)}<br />Atajos: <span className="kbd">Espacio</span> play · <span className="kbd">S</span> dividir · <span className="kbd">Supr</span> borrar · <span className="kbd">Ctrl+Z</span> deshacer · <span className="kbd">←/→</span> fotograma</div>
        <button className="btn sm" onClick={() => { if (confirm('¿Vaciar el proyecto?')) { upd(blank()); setSel(null); } }}>Nuevo proyecto</button>
      </div>}
      <div className="col" style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
        <button className="btn pri lg" onClick={doExport} disabled={exp && !exp.done && !exp.error}><Download size={17} />Exportar {Math.min(user.tier.width, user.tier.height)}p</button>
        <div className="muted" style={{ fontSize: 11.5 }}>{user.tier.watermark ? 'Plan gratis: 720p con marca de agua' : `Sin marca de agua · ${user.tier.fps} fps`}</div>
        {exp?.job && !exp.done && <div><div className="prog"><i style={{ width: exp.job.progress + '%' }} /></div><div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{exp.job.msg} · {exp.job.progress}%</div></div>}
        {exp?.done && <div className="col"><video src={exp.done.media.url} controls style={{ width: '100%', borderRadius: 12, aspectRatio: '9/16', background: '#000' }} /><div className="row"><SaveButtons m={exp.done.media} /></div><div className="muted" style={{ fontSize: 11 }}>{exp.done.quality}</div></div>}
        {exp?.error && <div style={{ color: '#f87171', fontSize: 12 }}>{exp.error.slice(0, 300)}</div>}
      </div>
    </>;
  const TABS = [...(mobile ? [['props', sel ? 'Ajustes' : 'Proyecto']] : []), ['media', 'Medios'], ['text', 'Texto'], ['filters', 'Filtros'], ['cine', 'Cine'], ['trans', 'Transic.'], ['audio', 'Audio']];
  return <div className="ed">
    <div className="lp">
      <div className="tabs">{TABS.map(([id, n]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{n}</button>)}</div>
      <div className="body">
        {tab === 'props' && mobile && <div className="col">{inspector}</div>}
        {tab === 'media' && <div className="col">
          <label className="drop" style={{ padding: 18 }} onClick={e => { if (isNativeApp) { e.preventDefault(); chooseFile(null, doUpload, setUpl, '*/*'); } }}><input type="file" accept="video/*,audio/*" hidden onChange={e => e.target.files[0] && doUpload(e.target.files[0])} /><Upload size={22} color="#ec4899" /><div style={{ fontWeight: 600, marginTop: 6 }}>Subir video o audio</div></label>
          <div className="row"><input className="inp" placeholder="Enlace directo a un .mp4" value={link} onChange={e => setLink(e.target.value)} /><button className="btn" onClick={doLink} disabled={!link}><Link2 size={15} /></button></div>
          {upl !== null && <div className="prog"><i style={{ width: upl + '%' }} /></div>}
          <div className="muted" style={{ fontSize: 12 }}>Haz clic para añadir a la línea de tiempo</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>{media.map(m => <div key={m.id} className="tile" onClick={() => addSeg(m)} title={m.name}>
            {m.thumbUrl ? <div className="thumbfx" style={{ backgroundImage: `url(${m.thumbUrl})`, aspectRatio: '1' }} /> : <div className="thumbfx" style={{ aspectRatio: '1', display: 'grid', placeItems: 'center', background: '#1a1a2a' }}><Music /></div>}
            <div className="nm">{m.name}</div><div className="row" style={{ justifyContent: 'space-between' }}><span className="badge">{m.kind}</span><span className="muted" style={{ fontSize: 11 }}>{fmt(m.duration)}</span></div></div>)}</div></div>}
        {tab === 'text' && <div className="col">
          <button className="btn pri" onClick={() => addText()}><Type size={15} />Añadir texto</button>
          <div className="h3" style={{ margin: '8px 0 0' }}>Estilos ({lib.textStyles.length})</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>{lib.textStyles.map(s => <div key={s.id} className={'tile' + (selText?.style === s.id ? ' on' : '')} onClick={() => selText ? upd(d => { d.texts.find(x => x.uid === selText.uid).style = s.id; return d; }) : addText(s.id)} style={{ textAlign: 'center', padding: '14px 4px', background: 'linear-gradient(160deg,#3b2a5a,#1a1a2a)' }}><span style={styleCss(s, 18)}>TEXTO</span><div className="nm">{s.name}</div></div>)}</div>
          <div className="h3" style={{ margin: '8px 0 0' }}>Animaciones ({lib.textAnimations.length})</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>{lib.textAnimations.map(a => <div key={a.id} className={'tile' + (selText?.anim === a.id ? ' on' : '')} style={{ padding: 8, textAlign: 'center' }} onClick={() => selText ? upd(d => { d.texts.find(x => x.uid === selText.uid).anim = a.id; return d; }) : notify('Selecciona un texto primero', 'bad')}><div className={'a-' + a.id} style={{ fontFamily: 'Poppins-Black', fontSize: 13 }}>Aa</div><div className="nm" style={{ fontSize: 10.5, marginTop: 4 }}>{a.name}</div></div>)}</div></div>}
        {tab === 'filters' && <div className="col"><div className="muted" style={{ fontSize: 12 }}>Aplicar a: <b style={{ color: '#fff' }}>{target ? 'clip ' + (p.segments.indexOf(target) + 1) : '—'}</b></div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>{lib.filters.map(x => <div key={x.id} className={'tile' + (target?.filter === x.id ? ' on' : '')} style={{ padding: 6 }} onClick={() => target && setSegProp('filter', x.id)}><div className="thumbfx" style={{ backgroundImage: target?.thumbUrl ? `url(${target.thumbUrl})` : undefined, background: target?.thumbUrl ? undefined : 'linear-gradient(160deg,#ff9a3c,#ff4f81,#6a3cff)', backgroundSize: 'cover', filter: x.css }} /><div className="nm" style={{ fontSize: 10.5 }}>{x.name}</div></div>)}</div></div>}
        {tab === 'cine' && <div className="col"><div className="muted" style={{ fontSize: 12 }}>LUTs, letterbox, grano, shakes y zooms. Se pueden combinar. {!user.tier.premiumFx && '(Vista previa libre; todos desbloqueados en el editor)'}</div>
          {['grade', 'struct', 'motion'].map(k => <div key={k}><div className="h3" style={{ margin: '6px 0' }}>{{ grade: 'LUTs / gradación', struct: 'Efectos de imagen', motion: 'Movimiento de cámara' }[k]}</div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>{lib.cinematic.filter(c => c.kind === k).map(c => { const on = target?.cinematic.includes(c.id); return <div key={c.id} className={'tile' + (on ? ' on' : '')} style={{ padding: '9px 10px', fontSize: 12, fontWeight: 600 }} onClick={() => target && setSegProp('cinematic', on ? target.cinematic.filter(x => x !== c.id) : [...target.cinematic, c.id])}>{on ? '✓ ' : ''}{c.name}</div>; })}</div></div>)}</div>}
        {tab === 'trans' && <div className="col"><div className="muted" style={{ fontSize: 12 }}>Transición al final del clip seleccionado → siguiente.</div>
          {target && <div><label className="lb">Duración {target.transition.dur}s</label><input type="range" min={0.2} max={2} step={0.1} value={target.transition.dur} onChange={e => setSegProp('transition', { ...target.transition, dur: +e.target.value })} /></div>}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 6 }}>{lib.transitions.map(x => <div key={x.id} className={'tile' + (target?.transition.type === x.id ? ' on' : '')} style={{ padding: '9px 10px', fontSize: 12, fontWeight: 600 }} onClick={() => target && setSegProp('transition', { ...target.transition, type: x.id })}>{x.name}</div>)}</div></div>}
        {tab === 'audio' && <div className="col">
          <div className="h3" style={{ margin: 0 }}>Música</div>
          {lib.music.map(m => <div key={m.id} className={'tile row' + (p.music?.id === 'lib:' + m.id ? ' on' : '')} style={{ padding: 8 }}><button className="btn sm" onClick={() => playSfx(m)}>{cur === m.id ? <Pause size={13} /> : <Play size={13} />}</button><b style={{ flex: 1, fontSize: 12.5 }}>{m.name}</b><button className="btn sm" onClick={() => upd(d => { d.music = { id: 'lib:' + m.id, name: m.name, url: m.url, volume: 0.35, start: 0 }; return d; })}><Plus size={13} /></button></div>)}
          {p.music && <div className="card col" style={{ padding: 12 }}><b>🎵 {p.music.name}</b><label className="lb">Volumen {Math.round(p.music.volume * 100)}%</label><input type="range" min={0} max={1.5} step={0.05} value={p.music.volume} onChange={e => upd(d => { d.music.volume = +e.target.value; return d; }, false)} /><button className="btn sm" onClick={() => upd(d => { d.music = null; return d; })}>Quitar música</button></div>}
          <div className="h3" style={{ margin: '8px 0 0' }}>Efectos de sonido ({lib.sfx.length}) <span className="muted" style={{ fontSize: 11 }}>· se añaden en el cabezal</span></div>
          {lib.sfx.map(s => <div key={s.id} className="tile row" style={{ padding: 6 }}><button className="btn sm" onClick={() => playSfx(s)}>{cur === s.id ? <Pause size={13} /> : <Play size={13} />}</button><span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{s.name}</span><span className="badge">{s.cat}</span><button className="btn sm" onClick={() => addSfx(s)}><Plus size={13} /></button></div>)}</div>}
      </div>
    </div>

    <div className="stage">
      <div ref={stage} className="screen" onClick={() => setSel(null)}>
        <div className={fxClasses} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {curSeg?.fit === 'blur' && <div style={{ position: 'absolute', inset: -30, backgroundImage: `url(${curSeg.thumbUrl})`, backgroundSize: 'cover', filter: 'blur(20px) brightness(.8)' }} />}
          <video ref={vid} playsInline style={{ objectFit: curSeg?.fit === 'crop' ? 'cover' : 'contain', objectPosition: `${(curSeg?.cropX ?? .5) * 100}% 50%`, filter: cssFilter, transform: curSeg?.zoom > 1 ? `scale(${curSeg.zoom})` : undefined }} />
          {grades.some(g => g.css === 'grain') && <div className="grainfx" style={{ position: 'absolute', inset: 0 }} />}
        </div>
        <div className="ov">{activeTexts.map(tx => { const st = lib.textStyles.find(s => s.id === tx.style) || lib.textStyles[0]; return <div key={tx.uid + (tx.anim) + tx.start} className={'ovtext a-' + tx.anim + (sel?.id === tx.uid ? ' sel' : '')} onPointerDown={e => dragText(e, tx)} style={{ left: tx.x * 100 + '%', top: tx.y * 100 + '%', maxWidth: '92%' }}><span style={styleCss(st, tx.size * sc)}>{tx.upper ? tx.text.toUpperCase() : tx.text}</span></div>; })}
          {user.tier.watermark && <div style={{ position: 'absolute', right: 12, bottom: 50, fontFamily: 'Poppins-Black', opacity: .55, fontSize: 46 * sc * 1.0 }}>Cliper</div>}
          {!p.segments.length && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--mut)', padding: 20 }}><div><Film size={36} /><div style={{ marginTop: 8 }}>Añade un video desde «Medios»</div></div></div>}
        </div>
      </div>
      <div className="row"><button className="btn sm" onClick={() => seek(0)}><SkipBack size={15} /></button><button className="btn pri" style={{ width: 54 }} onClick={() => playing ? pause() : play()}>{playing ? <Pause size={18} /> : <Play size={18} />}</button><span className="chip" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(t)} / {fmt(total)}</span><span className="muted hide-m" style={{ fontSize: 11 }}>9:16 · {user.tier.width}×{user.tier.height}</span>{mobile && <button className="btn sm pri" onClick={() => { setSel(null); setTab('props'); }}><Download size={14} />Exportar</button>}</div>
    </div>

    <div className="rp">{inspector}</div>

    <div className="tl">
      <div className="tlbar">
        <button className="btn sm" onClick={split} title="Dividir (S)"><Scissors size={14} />Dividir</button>
        <button className="btn sm" onClick={dup} disabled={!selSeg}><Copy size={14} />Duplicar</button>
        <button className="btn sm" onClick={del} disabled={!sel}><Trash2 size={14} />Eliminar</button>
        <button className="btn sm" onClick={() => move(-1)} disabled={!selSeg}><ChevronLeft size={14} /></button><button className="btn sm" onClick={() => move(1)} disabled={!selSeg}><ChevronRight size={14} /></button>
        <button className="btn sm" onClick={undo} disabled={!hist.length}><Undo2 size={14} />Deshacer</button>
        <button className="btn sm" onClick={() => addText()}><Type size={14} />Texto</button>
        <div style={{ flex: 1 }} /><button className="btn sm ghost" onClick={() => setPps(Math.max(8, pps / 1.4))}><ZoomOut size={15} /></button><button className="btn sm ghost" onClick={() => setPps(Math.min(300, pps * 1.4))}><ZoomIn size={15} /></button>
      </div>
      <div className="tracks" onPointerDown={e => { if (e.target.closest('.segb,.item')) return; const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left - 92 + e.currentTarget.scrollLeft) / pps); }}>
        <div style={{ width: tlWidth, position: 'relative' }}>
          <div className="ruler">{Array.from({ length: Math.ceil(tlWidth / pps / (pps < 20 ? 5 : 1)) }, (_, i) => i * (pps < 20 ? 5 : 1)).map(s => <span key={s} style={{ left: s * pps }}>{s}s</span>)}</div>
          <div className="track"><div className="tname"><Film size={12} />Video</div>{p.segments.map((s, i) => <div key={s.uid} className={'segb' + (sel?.id === s.uid ? ' sel' : '')} onPointerDown={e => { e.stopPropagation(); setSel({ type: 'seg', id: s.uid }); }} style={{ left: L[i].start * pps, width: Math.max(4, L[i].d * pps - 2), backgroundImage: s.thumbUrl ? `url(${s.thumbUrl})` : undefined, backgroundColor: '#2a2140', zIndex: i }}>
            <span>{i + 1} · {fmt(L[i].d)}{s.speed !== 1 ? ` · ${s.speed}x` : ''}</span>{i < p.segments.length - 1 && s.transition.type !== 'none' && <div className="tr" title={s.transition.type}>⇄</div>}</div>)}</div>
          <div className="track s"><div className="tname"><Type size={12} />Texto</div>{p.texts.map(x => <div key={x.uid} className="item" onPointerDown={e => dragItem(e, 'text', x)} style={{ left: x.start * pps, width: Math.max(10, (x.end - x.start) * pps), background: sel?.id === x.uid ? '#ec4899' : '#8b5cf6aa' }}>{x.text}</div>)}</div>
          <div className="track s"><div className="tname">🔊 SFX</div>{p.sfx.map(x => <div key={x.uid} className="item" onPointerDown={e => dragItem(e, 'sfx', x)} style={{ left: x.at * pps, width: 70, background: sel?.id === x.uid ? '#f97316' : '#f9731688' }}>{x.name}</div>)}</div>
          <div className="track s"><div className="tname"><Music size={12} />Música</div>{p.music && <div className="item" style={{ left: (p.music.start || 0) * pps, width: Math.max(0, total - (p.music.start || 0)) * pps, background: '#0ea5e988' }}>🎵 {p.music.name}</div>}</div>
          <div className="ph" style={{ left: t * pps }} />
        </div>
      </div>
    </div>
  </div>;
}
