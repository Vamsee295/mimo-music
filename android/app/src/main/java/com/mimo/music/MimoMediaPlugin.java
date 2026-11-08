package com.mimo.music;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Mimo's "Now playing" for Android, like Spotify / Apple Music: a MediaSession (lock screen, Bluetooth and
 * headset buttons, the system media panel with a draggable seek bar) plus a media-style notification with
 * album art and ⏮ ⏯ ⏭, run from a foreground service so Android doesn't suspend the app while it plays.
 *
 * JS (lib/native.ts) calls update() whenever the song, play state, duration or position changes; the
 * system moves the seek bar on its own between updates. Taps come back as "action" events.
 */
@CapacitorPlugin(name = "MimoMedia")
public class MimoMediaPlugin extends Plugin {

    static final String CHANNEL = "playback";
    static final int NOTIFICATION_ID = 1;
    static final String ACTION_PREV = "com.mimo.music.PREV";
    static final String ACTION_TOGGLE = "com.mimo.music.TOGGLE";
    static final String ACTION_NEXT = "com.mimo.music.NEXT";

    private static MimoMediaPlugin instance;
    /** the notification MimoPlaybackService shows when it starts */
    static Notification current;

    private MediaSessionCompat session;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean serviceRunning = false;

    private String title = "", artist = "", album = "", artUrl = "";
    private Bitmap art;
    private long durationMs = 0, positionMs = 0;
    private boolean playing = false;

    // While music plays with the screen off, Android naps the CPU and throttles Wi-Fi to save battery; the
    // audio buffer then briefly runs dry and you hear crackles. Like other music apps, hold a CPU wake lock
    // and a Wi-Fi lock — only while playing, released on pause/stop so idle battery isn't touched.
    private PowerManager.WakeLock cpuLock;
    private WifiManager.WifiLock wifiLock;

    @Override
    public void load() {
        instance = this;
        Context ctx = getContext();
        cpuLock = ((PowerManager) ctx.getSystemService(Context.POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mimo:playback");
        cpuLock.setReferenceCounted(false);
        WifiManager wifi = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wifi != null) {
            int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wifi.createWifiLock(mode, "mimo:playback");
            wifiLock.setReferenceCounted(false);
        }
        session = new MediaSessionCompat(ctx, "Mimo");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", -1); }
            @Override public void onPause() { emit("pause", -1); }
            @Override public void onStop() { emit("pause", -1); }
            @Override public void onSkipToNext() { emit("next", -1); }
            @Override public void onSkipToPrevious() { emit("prev", -1); }
            @Override public void onSeekTo(long pos) { emit("seek", pos / 1000.0); }
        });
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("The current song, with controls. Keeps music playing with the screen off.");
            ch.setShowBadge(false);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(ch);
        }
    }

    private void emit(String type, double position) {
        JSObject o = new JSObject();
        o.put("type", type);
        if (position >= 0) o.put("position", position);
        notifyListeners("action", o);
    }

    /** Notification buttons arrive here via MimoActionReceiver. */
    static void onNotificationButton(String action) {
        if (instance == null) return;
        if (ACTION_PREV.equals(action)) instance.emit("prev", -1);
        else if (ACTION_NEXT.equals(action)) instance.emit("next", -1);
        else if (ACTION_TOGGLE.equals(action)) instance.emit(instance.playing ? "pause" : "play", -1);
    }

    @PluginMethod
    public void update(PluginCall call) {
        title = call.getString("title", "");
        artist = call.getString("artist", "");
        album = call.getString("album", "");
        durationMs = Math.max(0, Math.round(call.getDouble("duration", 0.0) * 1000));
        positionMs = Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000));
        playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        String url = call.getString("artwork", "");
        if (url == null) url = "";
        if (!url.equals(artUrl)) {
            artUrl = url;
            art = null;
            loadArt(url);
        }
        session.setActive(true);
        applySession();
        show();
        holdLocks(playing);
        call.resolve();
    }

    private void holdLocks(boolean on) {
        try {
            if (on) {
                // safety timeout: renewed on every update (song change, play, seek); a long song still gets
                // refreshed by the next update, and a stuck state can never hold the CPU forever
                cpuLock.acquire(15 * 60 * 1000L);
                if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
            } else {
                if (cpuLock.isHeld()) cpuLock.release();
                if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
            }
        } catch (RuntimeException ignored) {
            // a lock call failing must never break playback
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        playing = false;
        holdLocks(false);
        if (session != null) session.setActive(false);
        if (serviceRunning) {
            getContext().stopService(new Intent(getContext(), MimoPlaybackService.class));
            serviceRunning = false;
        }
        call.resolve();
    }

    private void applySession() {
        MediaMetadataCompat.Builder m = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, album);
        if (durationMs > 0) m.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, durationMs); // shows the seek bar
        if (art != null) m.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
        session.setMetadata(m.build());
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO | PlaybackStateCompat.ACTION_STOP)
            // speed 1 while playing: the system advances the seek bar by itself between updates
            .setState(playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, positionMs, playing ? 1f : 0f)
            .build());
    }

    private PendingIntent button(String action, int code) {
        Intent i = new Intent(getContext(), MimoActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(getContext(), code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void show() {
        Context ctx = getContext();
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent openApp = open == null ? null : PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_mimo)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText(album)
            .setLargeIcon(art)
            .setContentIntent(openApp)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // controls on the lock screen
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setOngoing(playing)
            .addAction(android.R.drawable.ic_media_previous, "Previous", button(ACTION_PREV, 1))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", button(ACTION_TOGGLE, 2))
            .addAction(android.R.drawable.ic_media_next, "Next", button(ACTION_NEXT, 3))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        current = b.build();
        if (!serviceRunning) {
            ContextCompat.startForegroundService(ctx, new Intent(ctx, MimoPlaybackService.class));
            serviceRunning = true;
            askBatteryExemption();
        } else {
            try {
                ctx.getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, current);
            } catch (SecurityException ignored) {
                // notifications turned off for Mimo: playback still continues
            }
        }
    }

    /**
     * Phones from Oppo, Realme, Vivo, Xiaomi and others slow down "battery optimised" apps with the screen off,
     * even while a media notification is showing — the music then lags or crackles in sleep. Ask once (a system
     * Yes/No dialog, the first time music starts) to leave Mimo unrestricted, like Spotify asks on those phones.
     */
    private void askBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || getActivity() == null) return;
        Context ctx = getContext();
        android.content.SharedPreferences prefs = ctx.getSharedPreferences("mimo", Context.MODE_PRIVATE);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (prefs.getBoolean("askedBattery", false) || pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) return;
        prefs.edit().putBoolean("askedBattery", true).apply();
        try {
            getActivity().startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(android.net.Uri.parse("package:" + ctx.getPackageName())));
        } catch (RuntimeException ignored) {
            // some phones hide this screen; playback works either way
        }
    }

    /** Cover art for the notification / lock screen: an https URL (iTunes) or a data: URL (Your Music). */
    private void loadArt(final String url) {
        if (url.isEmpty()) return;
        io.submit(() -> {
            Bitmap bm = null;
            try {
                if (url.startsWith("data:")) {
                    byte[] bytes = Base64.decode(url.substring(url.indexOf(',') + 1), Base64.DEFAULT);
                    bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                } else if (url.startsWith("https://")) {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(8000);
                    try (InputStream in = c.getInputStream()) {
                        bm = BitmapFactory.decodeStream(in);
                    } finally {
                        c.disconnect();
                    }
                }
            } catch (Exception ignored) {
                // no art: the notification just shows without it
            }
            final Bitmap result = bm;
            main.post(() -> {
                if (!url.equals(artUrl) || result == null) return; // song changed meanwhile
                art = result;
                applySession();
                if (serviceRunning) show();
            });
        });
    }

    @Override
    protected void handleOnDestroy() {
        holdLocks(false);
        if (session != null) session.release();
        if (serviceRunning) getContext().stopService(new Intent(getContext(), MimoPlaybackService.class));
        io.shutdownNow();
        instance = null;
    }
}
