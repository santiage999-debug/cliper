package com.cliper.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.media.*;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.view.WindowManager;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Procesamiento nativo para videos largos: copia en streaming, decodificación de audio con MediaCodec,
 * muestreo de fotogramas con MediaMetadataRetriever y recorte sin recodificar con MediaMuxer.
 * Así ffmpeg.wasm solo recibe fragmentos cortos (nunca el archivo completo).
 */
@CapacitorPlugin(name = "CliperNative")
public class CliperNativePlugin extends Plugin {
    private final ExecutorService ex = Executors.newSingleThreadExecutor();
    private volatile boolean cancel = false;

    private void prog(String op, double p, String msg) { JSObject o = new JSObject(); o.put("op", op); o.put("progress", p); if (msg != null) o.put("msg", msg); notifyListeners("progress", o); }

    @PluginMethod public void cancel(PluginCall c) { cancel = true; c.resolve(); }

    // ---------- selección + copia en streaming ----------
    @PluginMethod public void pickVideo(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(call.getString("type", "video/*"));
        startActivityForResult(call, i, "picked");
    }
    @ActivityCallback private void picked(PluginCall call, ActivityResult r) {
        if (call == null) return;
        if (r.getResultCode() != Activity.RESULT_OK || r.getData() == null || r.getData().getData() == null) { JSObject o = new JSObject(); o.put("cancelled", true); call.resolve(o); return; }
        Uri uri = r.getData().getData(); cancel = false;
        ex.submit(() -> {
            try {
                String name = "video.mp4"; long size = -1;
                try (Cursor cu = getContext().getContentResolver().query(uri, null, null, null, null)) {
                    if (cu != null && cu.moveToFirst()) { int a = cu.getColumnIndex(OpenableColumns.DISPLAY_NAME), b = cu.getColumnIndex(OpenableColumns.SIZE); if (a >= 0) name = cu.getString(a); if (b >= 0) size = cu.getLong(b); }
                }
                File dir = new File(getContext().getFilesDir(), "media"); dir.mkdirs();
                String ext = name.contains(".") ? name.substring(name.lastIndexOf('.')) : ".mp4";
                File out = new File(dir, "m" + System.currentTimeMillis() + ext.toLowerCase());
                try (InputStream in = getContext().getContentResolver().openInputStream(uri); OutputStream os = new BufferedOutputStream(new FileOutputStream(out), 1 << 20)) {
                    byte[] buf = new byte[1 << 20]; long done = 0, last = 0; int n;
                    while ((n = in.read(buf)) > 0) { if (cancel) throw new InterruptedException("cancelled"); os.write(buf, 0, n); done += n;
                        if (size > 0 && done - last > 8_000_000) { last = done; prog("copy", done * 100.0 / size, null); } }
                }
                JSObject o = info(out.getAbsolutePath()); o.put("name", name); o.put("size", out.length()); call.resolve(o);
            } catch (Throwable e) { call.reject(e.getMessage() != null ? e.getMessage() : e.toString()); }
        });
    }
    @PluginMethod public void probe(PluginCall call) { ex.submit(() -> { try { call.resolve(info(call.getString("path"))); } catch (Throwable e) { call.reject(String.valueOf(e.getMessage())); } }); }
    private JSObject info(String path) throws IOException {
        JSObject o = new JSObject(); o.put("path", path);
        MediaMetadataRetriever mr = new MediaMetadataRetriever();
        try { mr.setDataSource(path);
            String d = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION), w = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH), h = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT), rot = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
            int W = w != null ? Integer.parseInt(w) : 0, H = h != null ? Integer.parseInt(h) : 0, R = rot != null ? Integer.parseInt(rot) : 0;
            if (R % 180 != 0) { int t = W; W = H; H = t; }
            o.put("duration", d != null ? Long.parseLong(d) / 1000.0 : 0); o.put("width", W); o.put("height", H); o.put("rotation", R);
            o.put("hasVideo", "yes".equals(mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO)));
            o.put("hasAudio", "yes".equals(mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)));
        } finally { mr.release(); }
        return o;
    }

    // ---------- audio: MediaCodec → mono 16 kHz ----------
    /** mode "energy": devuelve RMS (dB) cada stepMs. mode "pcm": escribe float32 16 kHz del rango [start,end] en un archivo. */
    @PluginMethod public void audio(PluginCall call) {
        cancel = false;
        ex.submit(() -> {
            MediaExtractor me = new MediaExtractor(); MediaCodec dec = null;
            try {
                String path = call.getString("path"), mode = call.getString("mode", "energy");
                double start = call.getDouble("start", 0.0), end = call.getDouble("end", -1.0), stepS = call.getDouble("step", 0.5);
                me.setDataSource(path); int tr = -1; MediaFormat f = null;
                for (int i = 0; i < me.getTrackCount(); i++) { MediaFormat t = me.getTrackFormat(i); if (t.getString(MediaFormat.KEY_MIME).startsWith("audio/")) { tr = i; f = t; break; } }
                if (tr < 0) { JSObject o = new JSObject(); o.put("noAudio", true); call.resolve(o); return; }
                me.selectTrack(tr); if (start > 0) me.seekTo((long) (start * 1e6), MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                long durUs = f.containsKey(MediaFormat.KEY_DURATION) ? f.getLong(MediaFormat.KEY_DURATION) : 0;
                double endS = end > 0 ? end : durUs / 1e6;
                dec = MediaCodec.createDecoderByType(f.getString(MediaFormat.KEY_MIME)); dec.configure(f, null, null, 0); dec.start();
                int sr = f.getInteger(MediaFormat.KEY_SAMPLE_RATE), ch = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                boolean pcm = "pcm".equals(mode);
                File outF = pcm ? File.createTempFile("pcm", ".f32", getContext().getCacheDir()) : null;
                OutputStream os = pcm ? new BufferedOutputStream(new FileOutputStream(outF), 1 << 18) : null;
                java.util.ArrayList<Double> en = new java.util.ArrayList<>();
                double acc = 0; long accN = 0, perStep = 0; double rsPos = 0; // remuestreo lineal a 16 kHz
                double ratio = sr / 16000.0; float prev = 0; long outSamples = 0; double tCur = start; long lastNote = 0;
                MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo(); boolean inEOS = false, outEOS = false; ByteBuffer ob = ByteBuffer.allocate(16000 * 4 * 4).order(ByteOrder.LITTLE_ENDIAN);
                int encoding = AudioFormat.ENCODING_PCM_16BIT;
                while (!outEOS) {
                    if (cancel) throw new InterruptedException("cancelled");
                    if (!inEOS) { int ii = dec.dequeueInputBuffer(5000); if (ii >= 0) { ByteBuffer b = dec.getInputBuffer(ii); int n = me.readSampleData(b, 0); long ts = me.getSampleTime();
                        if (n < 0 || (ts / 1e6) > endS + 0.2) { dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEOS = true; } else { dec.queueInputBuffer(ii, 0, n, ts, 0); me.advance(); } } }
                    int oi = dec.dequeueOutputBuffer(bi, 5000);
                    if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) { MediaFormat of = dec.getOutputFormat(); sr = of.getInteger(MediaFormat.KEY_SAMPLE_RATE); ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT); ratio = sr / 16000.0;
                        if (Build.VERSION.SDK_INT >= 24 && of.containsKey(MediaFormat.KEY_PCM_ENCODING)) encoding = of.getInteger(MediaFormat.KEY_PCM_ENCODING); continue; }
                    if (oi < 0) continue;
                    ByteBuffer b = dec.getOutputBuffer(oi); b.order(ByteOrder.LITTLE_ENDIAN);
                    double bufT = bi.presentationTimeUs / 1e6; int frames = bi.size / (ch * (encoding == AudioFormat.ENCODING_PCM_FLOAT ? 4 : 2));
                    for (int k = 0; k < frames; k++) {
                        double t = bufT + (double) k / sr; float s = 0;
                        for (int c = 0; c < ch; c++) s += encoding == AudioFormat.ENCODING_PCM_FLOAT ? b.getFloat(bi.offset + (k * ch + c) * 4) : b.getShort(bi.offset + (k * ch + c) * 2) / 32768f;
                        s /= ch; if (t < start) continue; if (t > endS) break;
                        // 16 kHz
                        rsPos += 1; while (rsPos >= ratio) { rsPos -= ratio; float v = s;
                            if (pcm) { if (ob.remaining() < 4) { os.write(ob.array(), 0, ob.position()); ob.clear(); } ob.putFloat(v); }
                            acc += v * v; accN++; outSamples++;
                            if (accN >= (long) (16000 * stepS)) { en.add(20 * Math.log10(Math.sqrt(acc / accN + 1e-9) + 1e-6)); acc = 0; accN = 0; } }
                        prev = s; tCur = t;
                    }
                    dec.releaseOutputBuffer(oi, false);
                    if ((bi.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEOS = true;
                    long now = System.currentTimeMillis(); if (now - lastNote > 400) { lastNote = now; prog("audio", Math.min(99, (tCur - start) * 100 / Math.max(0.1, endS - start)), null); }
                }
                if (pcm) { os.write(ob.array(), 0, ob.position()); os.close(); }
                JSObject o = new JSObject(); o.put("samples", outSamples); o.put("rate", 16000);
                if (pcm) o.put("file", outF.getAbsolutePath()); else { JSArray a = new JSArray(); for (Double d : en) a.put(Math.round(d * 100) / 100.0); o.put("energy", a); o.put("step", stepS); }
                call.resolve(o);
            } catch (Throwable e) { call.reject(e.getMessage() != null ? e.getMessage() : e.toString()); }
            finally { try { if (dec != null) { dec.stop(); dec.release(); } } catch (Throwable ignored) {} me.release(); }
        });
    }

    // ---------- fotogramas a baja resolución (proxy de análisis) ----------
    @PluginMethod public void frames(PluginCall call) {
        cancel = false;
        ex.submit(() -> {
            MediaMetadataRetriever mr = new MediaMetadataRetriever();
            try {
                String path = call.getString("path"); double step = call.getDouble("step", 1.0), dur = call.getDouble("duration", 0.0); int w = call.getInt("width", 256);
                mr.setDataSource(path);
                File dir = new File(getContext().getCacheDir(), "frames" + System.currentTimeMillis()); dir.mkdirs();
                JSArray list = new JSArray(); int i = 0; int[] prevH = null;
                for (double t = 0; t < dur; t += step, i++) {
                    if (cancel) throw new InterruptedException("cancelled");
                    Bitmap bm; long us = (long) (t * 1e6);
                    if (Build.VERSION.SDK_INT >= 27) bm = mr.getScaledFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, w, w);
                    else { Bitmap full = mr.getFrameAtTime(us, MediaMetadataRetriever.OPTION_CLOSEST_SYNC); bm = full == null ? null : Bitmap.createScaledBitmap(full, w, Math.max(1, full.getHeight() * w / full.getWidth()), true); }
                    if (bm == null) continue;
                    // histograma RGB (16 cubetas por canal) para detectar cambios de escena
                    Bitmap sm = Bitmap.createScaledBitmap(bm, 48, 27, true); int[] px = new int[48 * 27]; sm.getPixels(px, 0, 48, 0, 0, 48, 27);
                    int[] h = new int[48]; for (int p : px) { h[(p >> 20) & 15]++; h[16 + ((p >> 12) & 15)]++; h[32 + ((p >> 4) & 15)]++; }
                    double d = 0; if (prevH != null) for (int k = 0; k < 48; k++) d += Math.abs(h[k] - prevH[k]); prevH = h;
                    File jf = new File(dir, i + ".jpg"); try (FileOutputStream fo = new FileOutputStream(jf)) { bm.compress(Bitmap.CompressFormat.JPEG, 70, fo); }
                    bm.recycle(); sm.recycle();
                    JSObject o = new JSObject(); o.put("t", t); o.put("d", d / (48 * 27 * 3 * 2)); o.put("file", jf.getAbsolutePath()); list.put(o);
                    if (i % 5 == 0) prog("frames", t * 100 / dur, null);
                }
                JSObject r = new JSObject(); r.put("frames", list); r.put("dir", dir.getAbsolutePath()); call.resolve(r);
            } catch (Throwable e) { call.reject(e.getMessage() != null ? e.getMessage() : e.toString()); }
            finally { try { mr.release(); } catch (Throwable ignored) {} }
        });
    }

    // ---------- recorte sin recodificar (MediaMuxer) ----------
    @PluginMethod public void trim(PluginCall call) {
        cancel = false;
        ex.submit(() -> {
            MediaExtractor me = new MediaExtractor(); MediaMuxer mx = null;
            try {
                String path = call.getString("path"); double start = call.getDouble("start", 0.0), end = call.getDouble("end", 0.0);
                me.setDataSource(path); File out = File.createTempFile("seg", ".mp4", getContext().getCacheDir());
                mx = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
                int n = me.getTrackCount(); int[] map = new int[n]; int vtr = -1; int maxIn = 1 << 20;
                for (int i = 0; i < n; i++) { MediaFormat f = me.getTrackFormat(i); String m = f.getString(MediaFormat.KEY_MIME); map[i] = -1;
                    if (m.startsWith("video/") || m.startsWith("audio/")) { me.selectTrack(i); map[i] = mx.addTrack(f); if (m.startsWith("video/")) vtr = i;
                        if (f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxIn = Math.max(maxIn, f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE)); } }
                try { MediaMetadataRetriever mr = new MediaMetadataRetriever(); mr.setDataSource(path); String rot = mr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION); mr.release(); if (rot != null) mx.setOrientationHint(Integer.parseInt(rot)); } catch (Throwable ignored) {}
                mx.start();
                me.seekTo((long) (start * 1e6), MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                long first = -1; ByteBuffer buf = ByteBuffer.allocate(maxIn); MediaCodec.BufferInfo bi = new MediaCodec.BufferInfo(); long endUs = (long) (end * 1e6);
                while (true) { if (cancel) throw new InterruptedException("cancelled");
                    int ti = me.getSampleTrackIndex(); if (ti < 0) break; long ts = me.getSampleTime(); if (ts > endUs + 300000) break;
                    if (first < 0) first = ts;
                    int sz = me.readSampleData(buf, 0); if (sz < 0) break;
                    if (map[ti] >= 0 && ts >= first) { bi.offset = 0; bi.size = sz; bi.presentationTimeUs = ts - first; bi.flags = (me.getSampleFlags() & MediaExtractor.SAMPLE_FLAG_SYNC) != 0 ? MediaCodec.BUFFER_FLAG_KEY_FRAME : 0; mx.writeSampleData(map[ti], buf, bi); }
                    me.advance(); }
                mx.stop();
                JSObject o = new JSObject(); o.put("file", out.getAbsolutePath()); o.put("offset", first < 0 ? 0 : start - first / 1e6); o.put("size", out.length()); call.resolve(o);
            } catch (Throwable e) { call.reject(e.getMessage() != null ? e.getMessage() : e.toString()); }
            finally { try { if (mx != null) mx.release(); } catch (Throwable ignored) {} me.release(); }
        });
    }

    @PluginMethod public void deleteFile(PluginCall c) { String p = c.getString("path"); if (p != null) { File f = new File(p); if (f.isDirectory()) { File[] fs = f.listFiles(); if (fs != null) for (File x : fs) x.delete(); } f.delete(); } c.resolve(); }

    // ---------- pantalla encendida + servicio en primer plano ----------
    @PluginMethod public void keepAwake(PluginCall c) {
        boolean on = Boolean.TRUE.equals(c.getBoolean("on", true));
        getActivity().runOnUiThread(() -> { if (on) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); });
        c.resolve();
    }
    @PluginMethod public void foreground(PluginCall c) {
        Intent i = new Intent(getContext(), ProcessingService.class);
        if (Boolean.TRUE.equals(c.getBoolean("on", true))) {
            i.putExtra("title", c.getString("title", "Cliper")); i.putExtra("text", c.getString("text", "Procesando…")); i.putExtra("progress", c.getInt("progress", -1));
            try { if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i); } catch (Throwable e) { /* sin permiso de notificaciones: seguimos igual */ }
        } else getContext().stopService(i);
        c.resolve();
    }
}
