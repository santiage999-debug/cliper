import React, { useEffect, useState, createContext, useContext, useCallback, useRef } from 'react';
import { Home, Sparkles, Scissors, Library, Gem, Gift, FolderOpen, LogOut, Crown, Coins, Zap, Menu } from 'lucide-react';
import More from './pages/More.jsx';
import { api, setTok } from './api.js';
import Auth from './pages/Auth.jsx'; import Dashboard from './pages/Dashboard.jsx'; import AiClips from './pages/AiClips.jsx';
import Editor from './pages/Editor.jsx'; import LibraryPage from './pages/Library.jsx'; import Plans from './pages/Plans.jsx';
import Codes from './pages/Codes.jsx'; import Files from './pages/Files.jsx';
export const Ctx = createContext(null); export const useApp = () => useContext(Ctx);
const NAV = [['home', 'Inicio', Home], ['ai', 'Clips con IA', Sparkles, 'IA'], ['editor', 'Editor', Scissors], ['library', 'Biblioteca', Library], ['files', 'Mis archivos', FolderOpen], ['plans', 'Planes', Gem], ['codes', 'Códigos', Gift]];
const MOBILE_NAV = [['home', 'Inicio', Home], ['ai', 'IA', Sparkles], ['editor', 'Editor', Scissors], ['library', 'Recursos', Library], ['more', 'Más', Menu]];
const TITLES = { more: 'Más', home: 'Inicio', ai: 'Auto-clips con IA', editor: 'Editor manual', library: 'Biblioteca de recursos', files: 'Mis archivos', plans: 'Planes y créditos', codes: 'Códigos de invitado' };

export default function App() {
  const [user, setUser] = useState(undefined); const [page, setPage] = useState(location.hash.slice(1) || 'home');
  const lastUid = useRef(undefined);
  useEffect(() => { const id = user?.id ?? null; if (lastUid.current !== undefined && id !== lastUid.current && id) { setPage('home'); location.hash = 'home'; } lastUid.current = id; }, [user?.id]);
  const [lib, setLib] = useState(null); const [toast, setToast] = useState(null); const [editorLoad, setEditorLoad] = useState(null);
  useEffect(() => { api('/api/me').then(r => setUser(r.user)).catch(() => setUser(null)); api('/api/library').then(setLib); }, []);
  useEffect(() => { const f = () => setPage(location.hash.slice(1) || 'home'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const go = p => { location.hash = p; setPage(p); };
  const notify = useCallback((msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 4200); }, []);
  const refresh = useCallback(() => api('/api/me').then(r => setUser(r.user)), []);
  if (user === undefined) return null;
  const ctx = { user, setUser, refresh, lib, notify, go, editorLoad, setEditorLoad };
  if (!user) return <Ctx.Provider value={ctx}><Auth />{toast && <div className={'toast ' + toast.kind}>{toast.msg}</div>}</Ctx.Provider>;
  const u = user.usage;
  return <Ctx.Provider value={ctx}>
    <div className="shell">
      <aside className="side">
        <div className="logo"><i>✂</i><span>Clip<b>er</b></span></div>
        {NAV.map(([id, label, Icon, tag]) => <button key={id} className={'nav' + (page === id ? ' on' : '')} onClick={() => go(id)}><Icon size={18} />{label}{tag && <span className="tag">{tag}</span>}</button>)}
        <div className="grow" />
        <div className="quota">
          {user.unlimited ? <><b className="row" style={{ gap: 6 }}><Crown size={15} color="#facc15" /> Uso ilimitado</b><div style={{ marginTop: 6 }}>Cuenta dueña · todas las funciones Plus</div></> : <>
            <b>Clips IA gratis</b><div className="bar"><i style={{ width: (u.freeLeft / u.freeLimit * 100) + '%' }} /></div>
            <div>{u.freeLeft} de {u.freeLimit} disponibles {u.resetAt && <>· se renuevan {new Date(u.resetAt).toLocaleDateString('es', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</>}</div>
            <div style={{ marginTop: 8 }}><b>{user.credits}</b> créditos · Plan <b>{user.tier.name}</b></div>
            <button className="btn pri sm" style={{ width: '100%', marginTop: 10 }} onClick={() => go('plans')}><Zap size={14} />Mejorar plan</button></>}
        </div>
        <button className="nav" onClick={async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setTok(null); setUser(null); }}><LogOut size={17} />Cerrar sesión</button>
      </aside>
      <main className="main">
        <div className="top"><div className="logo mlogo"><i>✂</i></div><h1>{TITLES[page]}</h1><div className="sp" />
          {user.unlimited ? <span className="chip gold"><Crown size={14} />Ilimitado</span> : <span className="chip"><Sparkles size={14} color="#ec4899" />{u.freeLeft}/{u.freeLimit}<span className="hide-m">&nbsp;gratis</span></span>}
          <span className="chip"><Coins size={14} color="#facc15" />{user.unlimited ? '∞' : user.credits}<span className="hide-m">&nbsp;créditos</span></span>
          <span className="chip grad hide-m">{user.tier.name} · {Math.min(user.tier.width, user.tier.height)}p</span>
          <span className="chip hide-m" title={user.email}>{user.name}</span>
        </div>
        {page === 'home' && <Dashboard />}{page === 'ai' && <AiClips />}{page === 'editor' && <Editor />}
        {page === 'library' && <LibraryPage />}{page === 'plans' && <Plans />}{page === 'codes' && <Codes />}{page === 'files' && <Files />}{page === 'more' && <More />}
      </main>
      <nav className="bnav">{MOBILE_NAV.map(([id, label, Icon]) => <button key={id} className={(page === id || (id === 'more' && ['plans', 'codes', 'files'].includes(page))) ? 'on' : ''} onClick={() => go(id)}><Icon size={21} /><span>{label}</span></button>)}</nav>
    </div>
    {toast && <div className={'toast ' + toast.kind}>{toast.msg}</div>}
  </Ctx.Provider>;
}
