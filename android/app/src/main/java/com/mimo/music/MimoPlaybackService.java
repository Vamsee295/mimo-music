package com.mimo.music;

import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Foreground service for playback: while it runs, Android keeps Mimo alive with the screen off and shows
 * the media notification built by MimoMediaPlugin. Started on the first song, stopped when the queue ends.
 */
public class MimoPlaybackService extends Service {

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (MimoMediaPlugin.current == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(MimoMediaPlugin.NOTIFICATION_ID, MimoMediaPlugin.current, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(MimoMediaPlugin.NOTIFICATION_ID, MimoMediaPlugin.current);
        }
        // not sticky: if Android ever kills the app, don't resurrect an empty service
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
