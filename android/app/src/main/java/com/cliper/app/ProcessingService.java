package com.cliper.app;

import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/** Servicio en primer plano: mantiene vivo el proceso (y la CPU) mientras Cliper procesa un video. */
public class ProcessingService extends Service {
    static final String CH = "cliper_proc";
    static final int ID = 4711;
    private PowerManager.WakeLock wl;

    static Notification build(Context c, String title, String text, int progress) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null)
            nm.createNotificationChannel(new NotificationChannel(CH, "Procesando videos", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CH) : new Notification.Builder(c);
        b.setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle(title).setContentText(text).setOngoing(true).setOnlyAlertOnce(true).setContentIntent(pi);
        if (progress >= 0) b.setProgress(100, progress, false); else b.setProgress(0, 0, true);
        return b.build();
    }

    @Override public int onStartCommand(Intent i, int flags, int startId) {
        String t = i != null ? i.getStringExtra("title") : null, x = i != null ? i.getStringExtra("text") : null;
        int p = i != null ? i.getIntExtra("progress", -1) : -1;
        Notification n = build(this, t != null ? t : "Cliper", x != null ? x : "Procesando…", p);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC); else startForeground(ID, n);
        if (wl == null) { wl = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "cliper:proc"); wl.acquire(3 * 60 * 60 * 1000L); }
        return START_NOT_STICKY;
    }
    @Override public void onDestroy() { if (wl != null && wl.isHeld()) wl.release(); wl = null; super.onDestroy(); }
    @Override public IBinder onBind(Intent i) { return null; }
}
