// Puente al plugin nativo de Android (CliperNative). En navegador devuelve null y se usan los caminos wasm.
import { Capacitor, registerPlugin } from '@capacitor/core';
export const isNative = Capacitor.isNativePlatform();
export const Native = isNative ? registerPlugin('CliperNative') : null;
export const fileUrl = p => Capacitor.convertFileSrc(p.startsWith('file://') ? p : 'file://' + p);
export async function fileBlob(p, type = 'video/mp4') { const r = await fetch(fileUrl(p)); if (!r.ok) throw new Error('No se pudo leer ' + p); return new Blob([await r.arrayBuffer()], { type }); }
export async function withProgress(op, fn, onP) {
  if (!Native) return fn(); const h = await Native.addListener('progress', e => { if (!op || e.op === op) onP?.(e.progress, e); });
  try { return await fn(); } finally { h.remove(); }
}
