import { handle, getMediaBlob } from './local/server.js';
import { Capacitor } from '@capacitor/core';
export const BASE = '';
export async function api(path, opts = {}) {
  try { return await handle((opts.method || 'GET').toUpperCase(), path, opts.body); }
  catch (e) { const er = new Error(e.message || String(e)); er.data = e.data; er.status = e.status || 500; throw er; }
}
export async function uploadFile(file, onProgress, onMsg) { onProgress?.(5); const r = await api('/api/media/upload', { method: 'POST', body: { file, onProgress: (p, m) => { onProgress?.(p); onMsg?.(m); } } }); onProgress?.(100); if (r.media.persistMsg) onMsg?.(r.media.persistMsg); return r.media; }
export async function pollJob(id, onUpdate) {
  for (;;) { const { job } = await api('/api/jobs/' + id); onUpdate?.(job);
    if (job.status === 'done') return job; if (job.status === 'error') throw new Error(job.error || 'Falló el trabajo'); if (job.status === 'cancelled') throw new Error('cancelled');
    await new Promise(r => setTimeout(r, 700)); }
}
export const fmt = s => { s = Math.max(0, s || 0); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`; };
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function toCache(m) { const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const blob = await getMediaBlob(m.id); const name = (m.name || 'clip').replace(/[^\w\-. áéíóúñÁÉÍÓÚÑ]/g, '').slice(0, 60).replace(/\.mp4$/i, '') + '.mp4';
  // escritura por trozos para no agotar la memoria del puente nativo
  const CH = 3 * 1024 * 1024; let first = true;
  for (let o = 0; o < blob.size; o += CH) { const data = await b64(blob.slice(o, o + CH));
    if (first) { await Filesystem.writeFile({ path: name, data, directory: Directory.Cache }); first = false; } else await Filesystem.appendFile({ path: name, data, directory: Directory.Cache }); }
  return (await Filesystem.getUri({ path: name, directory: Directory.Cache })).uri; }
// Guardar en la galería (álbum "Cliper")
export async function saveToGallery(m) {
  if (!Capacitor.isNativePlatform()) { const a = document.createElement('a'); a.href = m.url; a.download = (m.name || 'clip') + (/\.mp4$/.test(m.name) ? '' : '.mp4'); a.click(); return 'Descargado'; }
  const { Media } = await import('@capacitor-community/media'); const uri = await toCache(m);
  let album; try { const { albums } = await Media.getAlbums(); album = albums.find(a => a.name === 'Cliper'); if (!album) { await Media.createAlbum({ name: 'Cliper' }); album = (await Media.getAlbums()).albums.find(a => a.name === 'Cliper'); } } catch {}
  await Media.saveVideo({ path: uri, albumIdentifier: album?.identifier });
  return 'Guardado en la galería (álbum Cliper)';
}
export async function shareMedia(m) {
  if (!Capacitor.isNativePlatform()) { if (navigator.share) { const b = await getMediaBlob(m.id); await navigator.share({ files: [new File([b], 'clip.mp4', { type: 'video/mp4' })] }); } return; }
  const { Share } = await import('@capacitor/share'); const uri = await toCache(m);
  await Share.share({ title: m.meta?.title || 'Clip de Cliper', files: [uri], dialogTitle: 'Compartir clip' });
}
export const setTok = () => {};
import { isNative as _isNative, Native as _Native, withProgress as _wp } from './local/native.js';
export const isNativeApp = _isNative;
// En Android: selector nativo + copia en streaming al almacenamiento de la app (sin cargar el archivo en memoria)
export async function pickVideo(onProgress, type = 'video/*') {
  const r = await _wp('copy', () => _Native.pickVideo({ type }), p => onProgress?.(Math.round(p)));
  if (r.cancelled) return null; onProgress?.(null); return { name: r.name, size: r.size, nativeInfo: r };
}
export async function chooseFile(inputRef, onFile, onProgress, type) {
  if (!_isNative) return inputRef.current?.click();
  try { const f = await pickVideo(onProgress, type); if (f) onFile(f); } catch (e) { onProgress?.(null); alert('No se pudo abrir el video: ' + e.message); }
}
export const fmtEta = s => s == null ? '' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}s` : `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min`;
