import React, { useState } from 'react'; import { api } from '../api.js'; import { useApp } from '../App.jsx'; import DownloadApp from './DownloadApp.jsx';
export default function Auth() {
  const { setUser, notify } = useApp(); const [mode, setMode] = useState('register'); const [f, setF] = useState({ email: '', password: '', name: '' }); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); try { const r = await api('/api/auth/' + mode, { method: 'POST', body: f }); setUser(r.user); } catch (er) { notify(er.message, 'bad'); } setBusy(false); };
  return <div className="auth">
    <div className="hero">
      <div className="logo" style={{ fontSize: 26 }}><i>✂</i><span>Clip<b>er</b></span></div>
      <h1>Convierte videos largos en <span className="gt">clips virales</span> en minutos.</h1>
      <p className="muted" style={{ fontSize: 17, maxWidth: 520, lineHeight: 1.6 }}>La IA detecta los mejores momentos, encuadra en 9:16 siguiendo el rostro, añade subtítulos animados, zooms y efectos. Y si prefieres control total, tienes un editor completo.</p>
      <div className="phones"><div className="phone"><span>ESTO TE VA A <b style={{ color: '#ffe600' }}>CAMBIAR</b></span><em /></div><div className="phone"><span>EL <b style={{ color: '#ffe600' }}>SECRETO</b> QUE NADIE CUENTA</span><em /></div><div className="phone"><span>MIRA <b style={{ color: '#ffe600' }}>ESTO</b></span><em /></div></div>
      <div style={{ alignSelf: "flex-start" }}><DownloadApp big /></div><div className="row muted" style={{ gap: 18 }}><span>✓ 5 clips IA gratis cada 3 días</span><span>✓ TikTok · Reels · Shorts</span></div>
    </div>
    <div className="authbox"><form className="card col" onSubmit={submit} style={{ gap: 14 }}>
      <div><div className="h2">{mode === 'register' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</div><div className="muted">{mode === 'register' ? 'Gratis. Sin tarjeta.' : 'Inicia sesión para seguir creando.'}</div></div>
      {mode === 'register' && <div><label className="lb">Nombre</label><input className="inp" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Tu nombre o canal" /></div>}
      <div><label className="lb">Email</label><input className="inp" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="tu@email.com" /></div>
      <div><label className="lb">Contraseña</label><input className="inp" type="password" required minLength={6} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
      <button className="btn pri lg" disabled={busy}>{busy ? 'Un momento…' : mode === 'register' ? 'Crear cuenta gratis' : 'Entrar'}</button>
      <button type="button" className="btn ghost" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Inicia sesión'}</button>
    </form></div>
  </div>;
}
