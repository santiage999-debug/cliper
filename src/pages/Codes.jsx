import React, { useState } from 'react'; import { api } from '../api.js'; import { useApp } from '../App.jsx'; import { Gift, Crown, Ticket } from 'lucide-react';
export default function Codes() {
  const { user, setUser, notify } = useApp(); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null);
  const go = async e => { e.preventDefault(); setBusy(true); try { const r = await api('/api/redeem', { method: 'POST', body: { code } }); setUser(r.user); setRes({ ok: true, m: r.message }); notify(r.message); setCode(''); } catch (er) { setRes({ ok: false, m: er.message }); if (er.data?.user) setUser(er.data.user); } setBusy(false); };
  return <div className="page" style={{ maxWidth: 820 }}>
    <div className="card" style={{ padding: 34, textAlign: 'center', background: 'radial-gradient(600px 200px at 50% 0,#ec489922,transparent),linear-gradient(180deg,#15151f,#0e0e16)' }}>
      <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--grad)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><Gift size={30} /></div>
      <div className="h2">Canjea un código de invitado</div>
      <div className="muted" style={{ marginBottom: 22 }}>¿Te invitaron? Introduce tu código para ganar créditos extra. Los códigos se validan de forma segura en tu teléfono.</div>
      <form className="row" onSubmit={go} style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ position: 'relative', flex: 1 }}><Ticket size={16} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--mut)' }} /><input className="inp" style={{ paddingLeft: 36, textTransform: 'none', letterSpacing: 1 }} value={code} onChange={e => setCode(e.target.value)} placeholder="Escribe tu código" /></div>
        <button className="btn pri" disabled={busy || !code.trim()}>{busy ? 'Validando…' : 'Canjear'}</button>
      </form>
      {res && <div style={{ marginTop: 16, fontWeight: 600, color: res.ok ? '#4ade80' : '#f87171' }}>{res.m}</div>}
    </div>
    <div className="grid g2" style={{ marginTop: 16 }}>
      <div className="card"><div className="muted">Tus créditos</div><div style={{ fontSize: 34, fontWeight: 800 }}>{user.unlimited ? '∞' : user.credits}</div></div>
      <div className="card"><div className="muted">Estado</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 8 }} className="row">{user.unlimited ? <><Crown color="#facc15" /> Dueño · ilimitado</> : `Plan ${user.tier.name}`}</div></div>
    </div>
    <div className="card muted" style={{ marginTop: 16, fontSize: 13, lineHeight: 1.7 }}>• Cada código de bienvenida puede canjearse <b>una vez por cuenta</b>.<br />• Algunos códigos especiales son de <b>una sola cuenta</b>: la primera que lo canjea queda como propietaria.<br />• Máximo 10 intentos cada 10 minutos.</div>
  </div>;
}
