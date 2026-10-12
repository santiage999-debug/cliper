import React, { useEffect, useState } from 'react'; import { api } from '../api.js'; import { useApp } from '../App.jsx'; import { ClipCard, Seg } from './common.jsx';
export default function Files() {
  const { go, setEditorLoad, notify } = useApp(); const [media, setMedia] = useState([]); const [f, setF] = useState('all');
  const load = () => api('/api/media').then(r => setMedia(r.media)); useEffect(() => { load(); }, []);
  const list = media.filter(m => f === 'all' || m.kind === f);
  const del = async m => { if (!confirm('¿Eliminar este archivo?')) return; await api('/api/media/' + m.id, { method: 'DELETE' }); notify('Eliminado'); load(); };
  return <div className="page col" style={{ gap: 16 }}>
    <Seg v={f} set={setF} opts={[['all', 'Todo'], ['clip', 'Clips IA'], ['export', 'Exportados'], ['video', 'Videos subidos'], ['audio', 'Audio']]} />
    {list.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))' }}>{list.map(m => m.kind === 'audio' ? <div key={m.id} className="card col"><b>🎵 {m.name}</b><audio src={m.url} controls style={{ width: '100%' }} /></div> :
      <ClipCard key={m.id} m={m} onEdit={m => { setEditorLoad(m); go('editor'); }} onDelete={del} />)}</div> : <div className="empty">Nada por aquí todavía.</div>}
  </div>;
}
