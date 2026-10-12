import React, { useEffect, useState } from 'react'; import { useApp } from '../App.jsx'; import { api } from '../api.js'; import { quota } from '../local/idb.js'; import DownloadApp from './DownloadApp.jsx';
import { Gem, Gift, FolderOpen, LogOut, Crown, HardDrive, ChevronRight, Info } from 'lucide-react';
export default function More() {
  const { user, go, setUser } = useApp(); const [q, setQ] = useState(null);
  useEffect(() => { quota().then(setQ); }, []);
  const Item = ({ icon: I, t, d, onClick, color }) => <button className="card row" style={{ width: '100%', textAlign: 'left', padding: 16, gap: 14 }} onClick={onClick}>
    <div className="feat"><div className="ic"><I size={20} color={color || '#f0abfc'} /></div></div><div style={{ flex: 1 }}><b>{t}</b><div className="muted" style={{ fontSize: 12.5 }}>{d}</div></div><ChevronRight size={18} className="muted" /></button>;
  return <div className="page col" style={{ gap: 12 }}>
    <div className="card row" style={{ gap: 14 }}><div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--grad)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 20 }}>{user.name[0]?.toUpperCase()}</div>
      <div style={{ flex: 1 }}><b>{user.name}</b><div className="muted" style={{ fontSize: 12.5 }}>{user.email}</div></div>
      {user.unlimited ? <span className="chip gold"><Crown size={14} />Ilimitado</span> : <span className="chip grad">{user.tier.name}</span>}</div>
    {!user.unlimited && <div className="card"><b>Clips IA gratis</b><div className="bar"><i style={{ width: (user.usage.freeLeft / user.usage.freeLimit * 100) + '%' }} /></div>
      <div className="muted" style={{ fontSize: 12.5 }}>{user.usage.freeLeft} de {user.usage.freeLimit} disponibles{user.usage.resetAt && ' · se renuevan ' + new Date(user.usage.resetAt).toLocaleString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {user.credits} créditos</div></div>}
    <Item icon={Gem} t="Planes y créditos" d="Hasta 57% de descuento" onClick={() => go('plans')} color="#facc15" />
    <Item icon={Gift} t="Códigos de invitado" d="Canjea tu código y gana créditos" onClick={() => go('codes')} />
    <Item icon={FolderOpen} t="Mis archivos" d="Clips, exportaciones y videos subidos" onClick={() => go('files')} />
    {q && <div className="card row" style={{ gap: 14 }}><HardDrive size={20} className="muted" /><div style={{ flex: 1 }}><b>Almacenamiento</b><div className="muted" style={{ fontSize: 12.5 }}>{(q.usage / 1e6).toFixed(0)} MB usados de {(q.quota / 1e9).toFixed(1)} GB disponibles en este teléfono</div></div></div>}
    <div className="card row muted" style={{ gap: 12, fontSize: 12.5, lineHeight: 1.5 }}><Info size={30} />Todo se procesa y se guarda en este teléfono: tus videos no se suben a ningún servidor.</div>
    <DownloadApp big />
    <button className="btn lg" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }); setUser(null); }}><LogOut size={17} />Cerrar sesión</button>
  </div>;
}
