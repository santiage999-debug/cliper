import React, { useState, useRef } from 'react'; import { api, uploadFile, pollJob, chooseFile, fmtEta } from '../api.js'; import { useApp } from '../App.jsx'; import { ClipCard, Toggle, Seg } from './common.jsx';
import { UploadCloud, Link2, Sparkles, Film, Wand2 } from 'lucide-react';
const STAGES = [['Descarg', 'Fuente'], ['energía', 'Audio'], ['escena', 'Escenas'], ['rostros', 'Rostros'], ['Transcrib', 'Whisper'], ['mejores', 'Momentos'], ['Editando', 'Edición'], ['Listo', 'Listo']];
const SUBS = [['viral', 'Viral'], ['impact', 'Impacto'], ['neon', 'Neón'], ['boxed', 'Caja'], ['minimal', 'Minimal']];
export default function AiClips() {
  const { user, refresh, notify, go, setEditorLoad } = useApp();
  const [src, setSrc] = useState('file'); const [file, setFile] = useState(null); const [url, setUrl] = useState(''); const [over, setOver] = useState(false);
  const [o, setO] = useState({ count: 3, minLen: 15, maxLen: 40, subStyle: 'viral', grade: 'viral', captions: true, punchIns: true, hookTitle: true, sfx: true, progressBar: true, fit: 'crop', upper: true, model: localStorage.getItem('cliper.model') || 'onnx-community/whisper-base_timestamped', lang: localStorage.getItem('cliper.lang') || '' });
  const [job, setJob] = useState(null); const [upMsg, setUpMsg] = useState(''); const jobRef = useRef(null); const [up, setUp] = useState(null); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const inp = useRef();
  const set = (k, v) => { if (k === 'model' || k === 'lang') localStorage.setItem('cliper.' + k, v); setO(x => ({ ...x, [k]: v })); };
  const left = user.unlimited ? Infinity : user.usage.freeLeft + user.credits;
  const start = async () => {
    setBusy(true); setRes(null); setJob(null);
    try {
      let body = { ...o };
      if (src === 'file') { if (!file) throw new Error('Elige un video'); setUp(0); const m = await uploadFile(file, setUp, setUpMsg); setUpMsg(''); setUp(null); body.mediaId = m.id; }
      else { if (!url.trim()) throw new Error('Pega un enlace'); body.url = url.trim(); }
      const r = await api('/api/ai/clips', { method: 'POST', body }); refresh();
      if (r.granted < r.requested) notify(`Solo te alcanzaba para ${r.granted} de ${r.requested} clips.`, 'bad');
      const j = await pollJob(r.jobId, setJob); setRes(j.result); notify(`¡${j.result.clips.length} clips listos!`); refresh();
    } catch (e) { notify(/cancel/i.test(e.message) ? 'Proceso cancelado. No se descontaron clips.' : e.message, /cancel/i.test(e.message) ? undefined : 'bad'); setJob(null); setUp(null); setUpMsg(''); refresh(); }
    setBusy(false);
  };
  const stageIdx = job ? (job.status === 'done' ? 7 : Math.max(0, STAGES.findIndex(s => (job.msg || '').includes(s[0])))) : -1;
  return <div className="page col" style={{ gap: 20 }}>
    <div className="grid" style={{ gridTemplateColumns: '1.3fr 1fr', alignItems: 'start' }}>
      <div className="card col" style={{ gap: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><div className="h3" style={{ margin: 0 }}>1 · Fuente del video</div><Seg v={src} set={setSrc} opts={[['file', '📁 Subir archivo'], ['link', '🔗 Enlace directo']]} /></div>
        {src === 'file' ? <div className={'drop' + (over ? ' over' : '')} onClick={() => chooseFile(inp, setFile, setUp)} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); setFile(e.dataTransfer.files[0]); }}>
          <input ref={inp} type="file" accept="video/*" hidden onChange={e => setFile(e.target.files[0])} />
          <UploadCloud size={40} color="#ec4899" /><div style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>{file ? file.name : 'Arrastra tu video aquí o haz clic'}</div>
          <div className="muted">{file ? (file.size / 1e6).toFixed(1) + ' MB' : 'MP4, MOV, WEBM, MKV · hasta 500 MB'}</div>
          {up !== null && <><div className="prog" style={{ marginTop: 14 }}><i style={{ width: up + '%' }} /></div><div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{upMsg || 'Preparando…'} {up}%</div></>}
        </div> : <div className="col"><div style={{ position: 'relative' }}><Link2 size={16} style={{ position: 'absolute', left: 13, top: 14, color: 'var(--mut)' }} /><input className="inp" style={{ paddingLeft: 38, padding: '13px 13px 13px 38px' }} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…  ·  TikTok · Instagram · Facebook · X" /></div>
          <div className="muted" style={{ fontSize: 12 }}>Solo enlaces directos a un archivo de video (.mp4). Para YouTube, TikTok o Instagram, guarda primero el video en tu galería y usa «Subir archivo». Usa solo contenido que tengas derecho a reutilizar.</div></div>}
        <div className="h3" style={{ margin: '6px 0 0' }}>2 · Estilo de subtítulos</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 8 }}>{SUBS.map(([id, n]) => <div key={id} className={'tile' + (o.subStyle === id ? ' on' : '')} onClick={() => set('subStyle', id)} style={{ textAlign: 'center', padding: '16px 6px' }}>
          <div style={{ fontFamily: { viral: 'Poppins-Black', impact: 'Anton-Regular', neon: 'Bangers-Regular', boxed: 'Poppins-Black', minimal: 'Poppins-Bold' }[id], fontSize: 17, textShadow: id === 'minimal' ? 'none' : '0 0 0 #000,2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000', background: id === 'boxed' ? '#000a' : 'none', borderRadius: 6 }}>HOLA <span style={{ color: { viral: '#ffe600', impact: '#ff3b3b', neon: '#ff2fb3', boxed: '#3cff7a', minimal: '#fff' }[id] }}>MUNDO</span></div><div className="nm">{n}</div></div>)}</div>
        <div className="h3" style={{ margin: '6px 0 0' }}>3 · Look</div>
        <Seg v={o.grade} set={v => set('grade', v)} opts={[['viral', 'Viral'], ['cinematic', 'Cinemático'], ['vibrant', 'Vibrante'], ['moody', 'Moody'], ['clean', 'Natural']]} />
        <Seg v={o.fit} set={v => set('fit', v)} opts={[['crop', 'Recorte inteligente (rostro)'], ['blur', 'Fondo desenfocado'], ['fit', 'Ajustar con barras']]} />
      </div>
      <div className="card col" style={{ gap: 14 }}>
        <div className="h3" style={{ margin: 0 }}>Ajustes de la IA</div>
        <div><label className="lb">Número de clips: <b style={{ color: '#fff' }}>{o.count}</b> (máx. {user.tier.maxClipsPerJob})</label><input type="range" min={1} max={user.tier.maxClipsPerJob} value={o.count} onChange={e => set('count', +e.target.value)} /></div>
        <div className="row"><div style={{ flex: 1 }}><label className="lb">Duración mín. {o.minLen}s</label><input type="range" min={5} max={Math.min(90, user.tier.maxClipLen)} value={o.minLen} onChange={e => set('minLen', Math.min(+e.target.value, o.maxLen))} /></div>
          <div style={{ flex: 1 }}><label className="lb">Duración máx. {o.maxLen}s</label><input type="range" min={8} max={user.tier.maxClipLen} value={o.maxLen} onChange={e => set('maxLen', Math.max(+e.target.value, o.minLen))} /></div></div>
        <Toggle on={o.captions} set={v => set('captions', v)}>Subtítulos automáticos (Whisper)</Toggle>
        {o.captions && <div className="col" style={{ gap: 8 }}><div className="lb">Calidad de transcripción</div>
          <Seg v={o.model} set={v => set('model', v)} opts={[['onnx-community/whisper-tiny_timestamped', '⚡ Rápida'], ['onnx-community/whisper-base_timestamped', '🎯 Alta'], ['onnx-community/whisper-small_timestamped', '💎 Máxima']]} />
          <div className="lb">Idioma del video</div><Seg v={o.lang} set={v => set('lang', v)} opts={[['', 'Auto'], ['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués']]} />
          <div className="muted" style={{ fontSize: 11.5 }}>La primera vez se descarga el modelo de IA ({o.model.includes('tiny') ? '~45' : o.model.includes('small') ? '~250' : '~130'} MB, con Wi-Fi). Después funciona sin internet.</div></div>}
        <Toggle on={o.upper} set={v => set('upper', v)}>Subtítulos en MAYÚSCULAS</Toggle>
        <Toggle on={o.punchIns} set={v => set('punchIns', v)}>Zoom punch-ins en picos</Toggle>
        <Toggle on={o.hookTitle} set={v => set('hookTitle', v)}>Título gancho al inicio</Toggle>
        <Toggle on={o.sfx} set={v => set('sfx', v)}>SFX (pop + whoosh)</Toggle>
        <Toggle on={o.progressBar} set={v => set('progressBar', v)}>Barra de progreso</Toggle>
        <div style={{ padding: 12, borderRadius: 12, background: '#0b0b13', border: '1px solid var(--line)', fontSize: 12.5 }} className="muted">
          {user.unlimited ? '👑 Uso ilimitado' : <>Disponibles: <b style={{ color: '#fff' }}>{user.usage.freeLeft}</b> gratis + <b style={{ color: '#fff' }}>{user.credits}</b> créditos. Este trabajo usará {Math.min(o.count, left)}.</>}
          {user.tier.watermark && <div>Plan gratis: 720p con marca de agua. <a href="#plans" onClick={() => go('plans')}>Mejorar</a></div>}</div>
        <button className="btn pri lg" disabled={busy || left < 1} onClick={start}><Sparkles size={18} />{busy ? 'Generando…' : left < 1 ? 'Sin clips disponibles' : `Generar ${o.count} clips`}</button>
      </div>
    </div>
    {job && job.status !== 'done' && <div className="card col">
      <div className="row" style={{ justifyContent: 'space-between' }}><b className="row"><Wand2 size={17} color="#ec4899" />{job.msg}</b><span className="muted">{job.progress}%{job.queuePos ? ` · en cola #${job.queuePos}` : ''}</span></div>
      <div className="row muted" style={{ fontSize: 12.5, justifyContent: 'space-between' }}><span>{job.eta != null && job.status === 'running' ? `⏱ Tiempo restante aprox.: ${fmtEta(job.eta)}` : 'Calculando tiempo…'}</span>
        <button className="btn sm" onClick={() => api('/api/jobs/' + job.id + '/cancel', { method: 'POST' }).catch(() => {})}>✕ Cancelar</button></div>
      <div className="muted" style={{ fontSize: 11.5 }}>Puedes bloquear la pantalla o cambiar de app: el proceso sigue (verás el avance en la notificación).</div>
      <div className="prog"><i style={{ width: job.progress + '%' }} /></div>
      <div className="steps">{STAGES.map(([k, n], i) => <span key={k} className={i < stageIdx ? 'done' : i === stageIdx ? 'on' : ''}>{i < stageIdx ? '✓ ' : ''}{n}</span>)}</div></div>}
    {res && <div className="col">
      <div className="row wrap" style={{ justifyContent: 'space-between' }}><div className="h3" style={{ margin: 0 }}><Film size={17} style={{ verticalAlign: -3 }} /> {res.clips.length} clips · ordenados por potencial viral</div>
        <div className="row muted" style={{ fontSize: 12.5 }}><span className="chip">⏱ {res.analysis.duration.toFixed(0)} s analizados</span><span className="chip">🎬 {res.analysis.scenes} cortes de escena</span><span className="chip">🙂 {res.analysis.faces} detecciones de rostro</span><span className="chip">🗣 {res.analysis.transcribed ? 'Transcrito (' + (res.analysis.language || '?') + ')' : 'Sin voz'}</span></div></div>
      {res.analysis.energy?.length > 0 && <div className="card" style={{ padding: 12 }}><div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Mapa de energía del audio y clips seleccionados</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', height: 50, gap: 1, position: 'relative' }}>{res.analysis.energy.map((e, i) => <div key={i} style={{ flex: 1, height: (8 + e * 92) + '%', background: '#8b5cf6aa', borderRadius: 1 }} />)}
          {res.clips.map(c => <div key={c.id} style={{ position: 'absolute', top: 0, bottom: 0, left: (c.meta.start / res.analysis.duration * 100) + '%', width: ((c.meta.end - c.meta.start) / res.analysis.duration * 100) + '%', background: '#ec489933', borderLeft: '2px solid #ec4899', borderRight: '2px solid #ec4899' }} />)}</div></div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))' }}>{res.clips.map(m => <ClipCard key={m.id} m={m} onEdit={m => { setEditorLoad(m); go('editor'); }} />)}</div></div>}
  </div>;
}
