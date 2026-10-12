import React from 'react'; import { Smartphone } from 'lucide-react'; import { isNativeApp } from '../api.js';
export default function DownloadApp({ big }) {
  if (isNativeApp) return null;
  return <a className={'btn pri' + (big ? ' lg' : '')} href="https://github.com/santiage999-debug/cliper/releases/latest/download/Cliper.apk" style={{ textDecoration: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
    <Smartphone size={18} />Descargar app Android (más rápida)</a>;
}
