import React, { useState } from 'react'; import { Download, Scissors, Trash2, Share2 } from 'lucide-react'; import { saveToGallery, shareMedia } from '../api.js'; import { useApp } from '../App.jsx';
export const Toggle = ({ on, set, children }) => <div className={'tog' + (on ? ' on' : '')} onClick={() => set(!on)}><span>{children}</span><span className="sw" /></div>;
export const Seg = ({ v, set, opts }) => <div className="seg">{opts.map(([id, l]) => <button key={id} className={v === id ? 'on' : ''} onClick={() => set(id)}>{l}</button>)}</div>;
export function SaveButtons({ m, compact }) {
  const { notify } = useApp(); const [busy, setBusy] = useState(false);
  const go = async fn => { setBusy(true); try { const r = await fn(m); r && notify(r); } catch (e) { if (!/cancel/i.test(e.message)) notify(e.message, 'bad'); } setBusy(false); };
  return <><button className="btn sm pri" style={{ flex: 1 }} disabled={busy} onClick={() => go(saveToGallery)}><Download size={14} />{busy ? '…' : compact ? 'Guardar' : 'Guardar en galería'}</button><button className="btn sm" disabled={busy} onClick={() => go(shareMedia)} title="Compartir"><Share2 size={14} /></button></>;
}
export function ClipCard({ m, onEdit, onDelete }) {
  const sc = m.meta?.score; const cls = sc >= 90 ? 'hi' : sc >= 75 ? 'md' : '';
  return <div className="clipcard">
    <div style={{ position: 'relative' }}><video src={m.url} poster={m.thumbUrl} controls preload="none" playsInline />{sc && <span className={'score ' + cls}>🔥 {sc}</span>}</div>
    <div style={{ padding: 12 }} className="col">
      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35, minHeight: 34 }}>{m.meta?.title || m.name}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>{m.duration?.toFixed(1)} s · {m.width}×{m.height}{m.meta?.faceFound ? ' · 🙂 rostro' : ''}</div>
      <div className="row"><SaveButtons m={m} compact />
        {onEdit && <button className="btn sm" onClick={() => onEdit(m)} title="Abrir en editor"><Scissors size={14} /></button>}
        {onDelete && <button className="btn sm" onClick={() => onDelete(m)} title="Eliminar"><Trash2 size={14} /></button>}</div>
    </div></div>;
}
