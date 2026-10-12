// Transcripción en el dispositivo con Whisper (transformers.js, WASM). Modelo cacheado tras la primera descarga.
import { pipeline, env } from '@huggingface/transformers';
env.allowLocalModels = false; env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL(import.meta.env.DEV ? '/ort/' : '../ort/', self.location.href).href;
env.backends.onnx.wasm.numThreads = 1;
let asr = null, cur = null;
self.onmessage = async ({ data }) => {
  const { id, audio, model, lang } = data;
  try {
    if (!asr || cur !== model) {
      asr = await pipeline('automatic-speech-recognition', model, { dtype: { encoder_model: model.includes('small') ? 'q8' : 'fp32', decoder_model_merged: 'q8' }, device: 'wasm',
        progress_callback: p => { if (p.status === 'progress') self.postMessage({ id, type: 'dl', file: p.file, progress: p.progress }); } });
      cur = model;
    }
    const CH = 30 * 16000; const words = []; let lang = null;
    for (let off = 0; off < audio.length; off += CH - 16000 * 2) {   // ventanas de 30 s con 2 s de solape
      const sl = audio.subarray(off, Math.min(audio.length, off + CH));
      const r = await asr(sl, { return_timestamps: 'word', chunk_length_s: 30, task: 'transcribe', ...(lang ? { language: lang } : {}) });
      const t0 = off / 16000;
      for (const c of r.chunks || []) { const s = t0 + c.timestamp[0], e = t0 + (c.timestamp[1] ?? c.timestamp[0] + 0.3);
        if (words.length && s < words[words.length - 1].e - 0.05) continue; const w = c.text.trim(); if (w) words.push({ s, e, w }); }
      self.postMessage({ id, type: 'progress', progress: Math.min(1, (off + CH) / audio.length) });
      if (off + CH >= audio.length) break;
    }
    self.postMessage({ id, type: 'done', words, lang });
  } catch (e) { self.postMessage({ id, type: 'error', error: String(e?.message || e) }); }
};
