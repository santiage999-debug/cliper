// ffmpeg.wasm (single-thread, sin SharedArrayBuffer) — funciona dentro del WebView de Android
import { FFmpeg } from '@ffmpeg/ffmpeg';
import coreURL from '@ffmpeg/core?url';
import wasmURL from '@ffmpeg/core/wasm?url';
let ff = null, loading = null, logs = [], onLog = null;
const FONTS = ['Poppins-Black','Poppins-Bold','Anton-Regular','BebasNeue-Regular','Bangers-Regular','PermanentMarker-Regular'];
export async function getFF() {
  if (ff) return ff;
  if (!loading) loading = (async () => {
    const f = new FFmpeg();
    f.on('log', ({ message }) => { logs.push(message); if (logs.length > 400) logs = logs.slice(-200); onLog?.(message); });
    await f.load({ coreURL, wasmURL });
    await f.createDir('/fonts').catch(() => {});
    for (const n of FONTS) { const b = new Uint8Array(await (await fetch(`./assets/fonts/${n}.ttf`)).arrayBuffer()); await f.writeFile(`/fonts/${n}.ttf`, b); }
    await f.createDir('/w').catch(() => {});
    ff = f; return f;
  })();
  return loading;
}
// Ejecuta ffmpeg con progreso basado en time= de los logs
export async function exec(args, dur, onP) {
  const f = await getFF(); logs = [];
  onLog = m => { const r = /time=(\d+):(\d+):([\d.]+)/.exec(m); if (r && dur && onP) onP(Math.min(99, ((+r[1]) * 3600 + (+r[2]) * 60 + (+r[3])) / dur * 100)); };
  const code = await f.exec(args); onLog = null;
  if (code !== 0) throw new Error('ffmpeg falló: ' + logs.filter(l => !/Loading font|fontselect|Glyph/.test(l)).slice(-15).join('\n'));
  return logs.join('\n');
}
export const lastLogs = () => logs.join('\n');
export const clearLogs = () => { logs = []; };
export async function writeBlob(name, blob) { const f = await getFF(); await f.writeFile(name, new Uint8Array(await blob.arrayBuffer())); }
export async function mountBlob(blob, name) { // sin copiar en memoria (WORKERFS)
  const f = await getFF(); const dir = '/m' + Math.random().toString(36).slice(2, 8);
  await f.createDir(dir); await f.mount('WORKERFS', { blobs: [{ name, data: blob }] }, dir); return { path: `${dir}/${name}`, dir };
}
export async function unmount(dir) { const f = await getFF(); await f.unmount(dir).catch(() => {}); await f.deleteDir(dir).catch(() => {}); }
export async function readFile(name) { const f = await getFF(); return f.readFile(name); }
export async function rm(name) { const f = await getFF(); await f.deleteFile(name).catch(() => {}); }
// Cancela lo que esté ejecutando ffmpeg (se recarga en el siguiente uso)
export function terminate() { try { ff?.terminate(); } catch {} ff = null; loading = null; }
