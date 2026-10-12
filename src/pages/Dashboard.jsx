import DownloadApp from './DownloadApp.jsx';
import React, { useEffect, useState } from 'react'; import { api } from '../api.js'; import { useApp } from '../App.jsx'; import { ClipCard } from './common.jsx';
import { Sparkles, Scissors, Wand2, Captions, Crop, Music, Gift } from 'lucide-react';
export default function Dashboard() {
  const { user, go, lib, setEditorLoad } = useApp(); const [media, setMedia] = useState([]);
  useEffect(() => { api('/api/media').then(r => setMedia(r.media)); }, []);
  const clips = media.filter(m => m.kind === 'clip' || m.kind === 'export').slice(0, 8);
  const count = lib ? lib.filters.length + lib.cinematic.length + lib.transitions.length + lib.textAnimations.length + lib.textStyles.length + lib.sfx.length + lib.music.length : 0;
  return <div className="page col" style={{ gap: 22 }}>
    <div className="card" style={{ padding: 34, background: 'radial-gradient(700px 300px at 100% 0,#ec489933,transparent),radial-gradient(500px 300px at 0 100%,#8b5cf633,transparent),#0f0f18' }}>
      <div className="h2" style={{ fontSize: 34 }}>Hola, {user.name} 👋</div>
      <div className="muted" style={{ fontSize: 15, maxWidth: 640 }}>Elige un video largo de tu galería y la IA te devuelve clips verticales listos para publicar. Todo se procesa en tu teléfono.</div>
      <div className="row" style={{ marginTop: 20, flexWrap: "wrap" }}><button className="btn pri lg" onClick={() => go('ai')}><Sparkles size={18} />Crear clips con IA</button><button className="btn lg" onClick={() => go('editor')}><Scissors size={18} />Abrir editor</button><button className="btn lg ghost" onClick={() => go('codes')}><Gift size={18} />Canjear código</button><DownloadApp big /></div>
    </div>
    <div className="grid g4">
      <div className="card stat"><span className="muted">Clips IA gratis</span><b>{user.unlimited ? '∞' : `${user.usage.freeLeft}/${user.usage.freeLimit}`}</b><span className="muted" style={{ fontSize: 12 }}>se renuevan cada 3 días</span></div>
      <div className="card stat"><span className="muted">Créditos</span><b>{user.unlimited ? '∞' : user.credits}</b><span className="muted" style={{ fontSize: 12 }}>1 crédito = 1 clip</span></div>
      <div className="card stat"><span className="muted">Calidad de export</span><b>{Math.min(user.tier.width, user.tier.height)}p</b><span className="muted" style={{ fontSize: 12 }}>{user.tier.watermark ? 'con marca de agua' : 'sin marca de agua'}</span></div>
      <div className="card stat"><span className="muted">Recursos en biblioteca</span><b>{count}</b><span className="muted" style={{ fontSize: 12 }}>efectos, sonidos, LUTs…</span></div>
    </div>
    <div className="grid g3">{[[Wand2, 'Detección de momentos', 'Picos de energía del audio, cambios de escena y ganchos en la transcripción.'], [Crop, 'Encuadre 9:16 inteligente', 'Detecta rostros y recorta siguiendo a quien habla.'], [Captions, 'Subtítulos animados', 'Whisper transcribe y resalta palabra a palabra, estilo viral.'], [Sparkles, 'Zoom punch-ins', 'Zooms automáticos en los momentos de mayor intensidad + whoosh.'], [Scissors, 'Editor completo', 'Línea de tiempo, cortes, velocidad, textos, filtros, transiciones.'], [Music, 'Música y SFX', `${lib?.sfx.length || 0} efectos de sonido y ${lib?.music.length || 0} pistas listas.`]].map(([I, t, d]) =>
      <div key={t} className="card feat"><div className="ic"><I size={20} color="#f0abfc" /></div><div><b>{t}</b><div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{d}</div></div></div>)}</div>
    <div><div className="row" style={{ justifyContent: 'space-between' }}><div className="h3">Tus clips recientes</div><button className="btn sm ghost" onClick={() => go('files')}>Ver todo</button></div>
      {clips.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>{clips.map(m => <ClipCard key={m.id} m={m} onEdit={m => { setEditorLoad(m); go('editor'); }} />)}</div> : <div className="empty">Aún no tienes clips. ¡Crea los primeros con IA!</div>}</div>
  </div>;
}
