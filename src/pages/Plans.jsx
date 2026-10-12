import React, { useEffect, useState } from 'react'; import { api } from '../api.js'; import { useApp } from '../App.jsx'; import { CreditCard, X, Lock } from 'lucide-react';
export default function Plans() {
  const { user, setUser, notify } = useApp(); const [data, setData] = useState(null); const [co, setCo] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/plans').then(setData); }, []);
  if (!data) return null;
  const buy = async p => { const r = await api('/api/checkout', { method: 'POST', body: { planId: p.id } }); setCo({ ...r, plan: p }); };
  const confirm = async () => { setBusy(true); try { const r = await api(`/api/checkout/${co.paymentId}/confirm`, { method: 'POST' }); setUser(r.user); notify(`Pago simulado OK: +${co.plan.credits} créditos (${co.plan.name})`); setCo(null); } catch (e) { notify(e.message, 'bad'); } setBusy(false); };
  return <div className="page">
    <div style={{ textAlign: 'center', marginBottom: 34 }}>
      <span className="chip" style={{ color: '#4ade80', borderColor: '#22c55e55' }}>🔥 Oferta de lanzamiento · hasta 57% de descuento</span>
      <div className="h2" style={{ fontSize: 40, marginTop: 14 }}>Créditos para <span className="gt">crear sin límites</span></div>
      <div className="muted" style={{ fontSize: 15 }}>Pago único, sin suscripción. 1 crédito = 1 clip IA. Gratis: {data.free.limit} clips cada {data.free.days} días con marca de agua a 720p.</div>
    </div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
      {data.plans.map(p => { const off = Math.round((1 - p.price / p.regular) * 100); const cur = user.plan === p.id;
        return <div key={p.id} className={'plan' + (p.popular || p.best ? ' pop' : '')} style={{ '--pc': p.color }}>
          {p.popular && <div className="ribbon">⭐ MÁS POPULAR</div>}{p.best && <div className="ribbon">💎 MEJOR VALOR</div>}
          <div><div style={{ fontWeight: 800, fontSize: 18, color: p.color }}>{p.name}</div><div className="muted" style={{ fontSize: 12 }}>{p.credits} créditos · ${(p.price / p.credits * 100).toFixed(1)}¢ por clip</div></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 0 }}><span className="price">${p.price}</span><span className="old">${p.regular}</span></div>
          <div><span className="off">-{off}% · ahorras ${p.regular - p.price}</span></div>
          <ul>{p.features.map(f => <li key={f}>{f}</li>)}</ul>
          <button className={'btn ' + (p.popular || p.best ? 'pri' : '')} onClick={() => buy(p)}>{cur ? 'Comprar más créditos' : 'Elegir ' + p.name}</button>
        </div>; })}
    </div>
    <div className="card" style={{ marginTop: 26 }}>
      <div className="h3">Comparativa</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr className="muted">{['', 'Gratis', ...data.plans.map(p => p.name)].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--line)' }}>{h}</th>)}</tr></thead>
        <tbody>{[['Calidad export', t => `${Math.min(t.width, t.height)}p ${t.fps}fps`], ['Marca de agua', t => t.watermark ? 'Sí' : 'No'], ['Prioridad en cola', t => '★'.repeat(t.priority) || '—'], ['Efectos premium', t => t.premiumFx ? '✓' : '—'], ['Clips por video', t => t.maxClipsPerJob], ['Duración máx. clip', t => t.maxClipLen + ' s']].map(([n, fn]) =>
          <tr key={n}><td style={{ padding: 8, fontWeight: 600 }}>{n}</td>{['free', ...data.plans.map(p => p.id)].map(id => <td key={id} style={{ padding: 8 }}>{fn(data.tiers[id])}</td>)}</tr>)}</tbody></table>
    </div>
    {co && <div style={{ position: 'fixed', inset: 0, background: '#000b', zIndex: 50, display: 'grid', placeItems: 'center' }}>
      <div className="card col" style={{ width: 420, gap: 14 }}>
        <div className="row"><CreditCard /><b style={{ fontSize: 17 }}>Checkout · {co.plan.name}</b><div style={{ flex: 1 }} /><button className="btn ghost sm" onClick={() => setCo(null)}><X size={16} /></button></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">{co.plan.credits} créditos</span><b style={{ fontSize: 24 }}>${co.plan.price}.00 USD</b></div>
        <div style={{ padding: 12, borderRadius: 11, background: '#facc1512', border: '1px solid #facc1544', fontSize: 12.5, color: '#fde68a' }}>Modo de pago <b>simulado</b>. Aquí se conectará Stripe Checkout (ver <code>server/src/index.js</code>, «PUNTO DE INTEGRACIÓN STRIPE»). No se cobra nada.</div>
        <input className="inp" defaultValue="4242 4242 4242 4242" disabled /><div className="row"><input className="inp" defaultValue="12/30" disabled /><input className="inp" defaultValue="123" disabled /></div>
        <button className="btn pri lg" disabled={busy} onClick={confirm}><Lock size={15} />{busy ? 'Procesando…' : `Pagar $${co.plan.price} (simulado)`}</button>
      </div></div>}
  </div>;
}
