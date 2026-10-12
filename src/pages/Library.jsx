import React, { useState, useEffect, useRef } from 'react'; import { useApp } from '../App.jsx'; import { api } from '../api.js'; import { Play, Pause, Search } from 'lucide-react';
export const SAMPLE_BG = 'linear-gradient(160deg,#ff9a3c 0%,#ff4f81 35%,#6a3cff 70%,#0b1a3a 100%)';
export const cineClass = c => c.kind === 'grade' ? '' : ({ letterbox: 'lbx', 'letterbox-thin': 'lbx', vignette: 'vig', 'vignette-strong': 'vig' }[c.css] || 'fx-' + c.css);
export const styleCss = (st, size = 28) => ({ fontFamily: st.font, fontSize: size, color: st.color?.length === 9 && st.color.endsWith('00') ? 'transparent' : st.color?.slice(0, 7),
  WebkitTextStroke: st.stroke ? `${Math.max(1, st.strokeW * size / 72 * 0.9)}px ${st.stroke.slice(0, 7)}` : undefined, paintOrder: 'stroke fill',
  background: st.box ? st.box.slice(0, 7) + (st.box.length === 9 ? st.box.slice(7) : '') : undefined, padding: st.box ? '2px 10px' : undefined, borderRadius: st.box ? 6 : undefined,
  textShadow: st.box ? 'none' : '0 3px 4px #0008' });
export function useSfxPlayer() {
  const a = useRef(new Audio()); const [cur, setCur] = useState(null);
  useEffect(() => { const x = a.current; x.onended = () => setCur(null); return () => x.pause(); }, []);
  return [cur, (s) => { if (cur === s.id) { a.current.pause(); setCur(null); } else { a.current.src = s.url; a.current.play(); setCur(s.id); } }];
}
export default function LibraryPage() {
  const { lib } = useApp(); const [tab, setTab] = useState('filters'); const [q, setQ] = useState(''); const [cur, play] = useSfxPlayer(); const [bg, setBg] = useState(null); const [k, setK] = useState(0);
  useEffect(() => { api('/api/media').then(r => { const v = r.media.find(m => m.thumbUrl); if (v) setBg(v.thumbUrl); }); }, []);
  if (!lib) return null;
  const T = [['filters', 'Filtros', lib.filters.length], ['cinematic', 'Cinematográficos', lib.cinematic.length], ['transitions', 'Transiciones', lib.transitions.length], ['textAnimations', 'Animaciones de texto', lib.textAnimations.length], ['textStyles', 'Estilos de texto', lib.textStyles.length], ['sfx', 'Efectos de sonido', lib.sfx.length], ['music', 'Música', lib.music.length]];
  const f = x => !q || x.name.toLowerCase().includes(q.toLowerCase());
  const bgs = bg ? { backgroundImage: `url(${bg})` } : { background: SAMPLE_BG };
  const cats = [...new Set(lib.sfx.map(s => s.cat))];
  return <div className="page">
    <div className="row" style={{ marginBottom: 6 }}><div className="h2" style={{ flex: 1 }}>{T.reduce((a, t) => a + t[2], 0)} recursos <span className="gt">incluidos en todos los planes</span></div>
      <div style={{ position: 'relative', width: 280 }}><Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--mut)' }} /><input className="inp" style={{ paddingLeft: 34 }} placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} /></div></div>
    <div className="tabs">{T.map(([id, n, c]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{n} <span className="badge">{c}</span></button>)}</div>
    {tab === 'filters' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>{lib.filters.filter(f).map(x => <div key={x.id} className="tile"><div className="thumbfx" style={{ ...bgs, filter: x.css }} /><div className="nm">{x.name}</div></div>)}</div>}
    {tab === 'cinematic' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))' }}>{lib.cinematic.filter(f).map(x => <div key={x.id} className="tile"><div className={'thumbfx ' + cineClass(x)} style={{ ...bgs, filter: x.kind === 'grade' ? x.css : undefined }}>{x.css === 'grain' && <div className="grainfx" style={{ position: 'absolute', inset: 0 }} />}</div><div className="nm">{x.name}</div><span className="badge">{{ grade: 'LUT', struct: 'Efecto', motion: 'Movimiento' }[x.kind]}</span></div>)}</div>}
    {tab === 'transitions' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>{lib.transitions.filter(f).map((x, i) => <div key={x.id} className="tile" onMouseEnter={() => setK(i)}><div className="thumbfx" style={{ aspectRatio: '16/10', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', display: 'grid', placeItems: 'center', fontSize: 22 }}>{['⇄', '◐', '⟿', '◎', '▤', '✦'][i % 6]}</div><div className="nm">{x.name}</div><span className="badge">xfade:{x.id}</span></div>)}</div>}
    {tab === 'textAnimations' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>{lib.textAnimations.filter(f).map(x => <div key={x.id + k} className="tile" onClick={() => setK(k + 1)}><div className="thumbfx" style={{ aspectRatio: '16/10', background: '#0b0b13', display: 'grid', placeItems: 'center' }}><div className={'a-' + x.id} style={{ fontFamily: 'Poppins-Black', fontSize: 20, textShadow: '2px 2px 0 #000' }}>TEXTO</div></div><div className="nm">{x.name}</div></div>)}</div>}
    {tab === 'textStyles' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))' }}>{lib.textStyles.filter(f).map(x => <div key={x.id} className="tile"><div className="thumbfx" style={{ ...bgs, aspectRatio: '16/10', display: 'grid', placeItems: 'center' }}><span style={styleCss(x, 26)}>VIRAL</span></div><div className="nm">{x.name}</div></div>)}</div>}
    {tab === 'sfx' && cats.map(c => <div key={c} style={{ marginBottom: 18 }}><div className="h3">{c}</div><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10 }}>{lib.sfx.filter(s => s.cat === c).filter(f).map(s =>
      <div key={s.id} className={'tile row' + (cur === s.id ? ' on' : '')} onClick={() => play(s)}><div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--grad)', display: 'grid', placeItems: 'center', flex: 'none' }}>{cur === s.id ? <Pause size={15} /> : <Play size={15} />}</div><b style={{ fontSize: 12.5 }}>{s.name}</b></div>)}</div></div>)}
    {tab === 'music' && <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))' }}>{lib.music.filter(f).map(s => <div key={s.id} className={'tile row' + (cur === s.id ? ' on' : '')} onClick={() => play(s)}><div style={{ width: 40, height: 40, borderRadius: 11, background: 'linear-gradient(135deg,#0ea5e9,#8b5cf6)', display: 'grid', placeItems: 'center' }}>{cur === s.id ? <Pause size={16} /> : <Play size={16} />}</div><div><b>{s.name}</b><div className="muted" style={{ fontSize: 11 }}>Loop 30 s · libre de derechos</div></div></div>)}</div>}
  </div>;
}
