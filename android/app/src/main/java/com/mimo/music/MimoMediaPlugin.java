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
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
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
@androidx.annotation.OptIn(markerClass = UnstableApi.class)
@CapacitorPlugin(name = "MimoMedia")
public class MimoMediaPlugin extends Plugin {

    static final String CHANNEL = "playback";
    static final int NOTIFICATION_ID = 1;
    static final String ACTION_PREV = "com.mimo.music.PREV";
    static final String ACTION_TOGGLE = "com.mimo.music.TOGGLE";
    static final String ACTION_NEXT = "com.mimo.music.NEXT";
    static final String ACTION_LIKE = "com.mimo.music.LIKE";
    static final String CUSTOM_LIKE = "mimo.like"; // lock-screen / system media controls ♥

    private static MimoMediaPlugin instance;
    /** the notification MimoPlaybackService shows when it starts */
    static Notification current;

    private MediaSessionCompat session;

    // One media session for the whole app: the plugin drives it, and Android Auto / other media browsers
    // (MimoBrowserService) connect to the same one, so the car shows and controls what's playing.
    private static MediaSessionCompat shared;

    static synchronized MediaSessionCompat session(Context c) {
        if (shared == null) shared = new MediaSessionCompat(c.getApplicationContext(), "Mimo");
        return shared;
    }
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    /** downloads, one at a time, apart from `io` so a song download never delays playback lookups */
    private final ExecutorService dl = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean serviceRunning = false;

    private String title = "", artist = "", album = "", artUrl = "";
    private boolean liked = false; // the current song is in Liked Songs (♥ in the notification)
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
        session = session(ctx);
        android.content.SharedPreferences prefs = ctx.getSharedPreferences("mimo", Context.MODE_PRIVATE);
        eqOn = prefs.getBoolean("eqOn", false);
        eqLevels = prefs.getString("eqLevels", "");
        eqPreset = prefs.getInt("eqPreset", -1);
        levelOn = prefs.getBoolean("levelOn", false);
        fadeMs = prefs.getInt("fadeMs", 0);
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", -1); }
            @Override public void onPause() { emit("pause", -1); }
            @Override public void onStop() { emit("pause", -1); }
            @Override public void onSkipToNext() { emit("next", -1); }
            @Override public void onCustomAction(String action, android.os.Bundle extras) {
                if (CUSTOM_LIKE.equals(action)) emit("like", -1);
            }
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
        else if (ACTION_LIKE.equals(action)) instance.emit("like", -1);
    }

    @PluginMethod
    public void update(final PluginCall call) {
        main.post(() -> applyUpdate(call)); // main thread: the session, the notification and ExoPlayer all live there
    }

    private void applyUpdate(PluginCall call) {
        title = call.getString("title", "");
        artist = call.getString("artist", "");
        album = call.getString("album", "");
        durationMs = Math.max(0, Math.round(call.getDouble("duration", 0.0) * 1000));
        positionMs = Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000));
        // the native player knows the real position; the page's copy goes stale while the screen is off
        if (exo != null && exo.getMediaItemCount() > 0 && exo.getPlaybackState() != Player.STATE_IDLE) positionMs = exo.getCurrentPosition();
        playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        liked = Boolean.TRUE.equals(call.getBoolean("liked", false));
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
        MimoWidget.refresh(getContext(), title, artist, playing, art, true);
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
        main.post(() -> {
            if (exo == null) return;
            exo.stop();
            exo.clearMediaItems();
        });
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
            // ♥ on the lock screen / system media controls (Android 13+ draws these from the session)
            .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(CUSTOM_LIKE, liked ? "Unlove" : "Love",
                liked ? R.drawable.ic_heart : R.drawable.ic_heart_outline).build())
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
            .addAction(liked ? R.drawable.ic_heart : R.drawable.ic_heart_outline, liked ? "Unlove" : "Love", button(ACTION_LIKE, 4))
            .addAction(android.R.drawable.ic_media_previous, "Previous", button(ACTION_PREV, 1))
            .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", button(ACTION_TOGGLE, 2))
            .addAction(android.R.drawable.ic_media_next, "Next", button(ACTION_NEXT, 3))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(1, 2, 3)); // compact: ⏮ ⏯ ⏭ (♥ shows when expanded)
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
     * even while a media notification is showing — the music then lags or crackles in sleep. Ask (a system
     * Yes/No dialog, the first time music starts after opening the app) to leave Mimo unrestricted, like Spotify asks on those phones.
     */
    private void askBatteryExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || getActivity() == null) return;
        Context ctx = getContext();
        android.content.SharedPreferences prefs = ctx.getSharedPreferences("mimo", Context.MODE_PRIVATE);
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        // up to 3 times in total (once per app start at most): a dismissed dialog shouldn't leave Mimo restricted
        // for good, but it must not nag either
        int asks = prefs.getInt("batteryAsks", prefs.getBoolean("askedBattery", false) ? 1 : 0);
        if (asks >= 3 || pm.isIgnoringBatteryOptimizations(ctx.getPackageName())) return;
        prefs.edit().putInt("batteryAsks", asks + 1).apply();
        try {
            getActivity().startActivity(new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
                .setData(android.net.Uri.parse("package:" + ctx.getPackageName())));
        } catch (RuntimeException ignored) {
            // some phones hide this screen; playback works either way
        }
    }


    // The audio engine: ExoPlayer, like BitChord. Streams play here, not in the page. Android can slow a
    // web page down with the screen off, but not this. ~50s buffered ahead, the last 200 MB kept on disk
    // (replays and seeking back cost no data), pauses for calls / unplugged headphones, holds its own
    // CPU + Wi-Fi locks. The page (PlayerBar) is the remote: play / setPlaying / seek / setNext, and it
    // hears back "time", "ended", "error" on the same "action" channel as the notification buttons.
    private static SimpleCache cache; // one per process: SimpleCache refuses a second instance on the same folder
    private ExoPlayer exo;
    /** set when the player rolled into the preloaded next song by itself; the page's play() for it is then a no-op */
    private String autoAdvanced;
    /** songs the player already rolled past by itself, which the page hasn't caught up with yet: if it asks for
     *  one of them late (it was asleep through several change-overs), that request is ignored, not replayed */
    private final java.util.Set<String> passed = new java.util.HashSet<>();
    private boolean resumed = true;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (exo != null && exo.isPlaying()) emitTime();
            main.postDelayed(this, 500);
        }
    };

    private ExoPlayer player() {
        if (exo != null) return exo;
        Context ctx = getContext().getApplicationContext();
        if (cache == null) {
            cache = new SimpleCache(new java.io.File(ctx.getCacheDir(), "audio"),
                new LeastRecentlyUsedCacheEvictor(200L << 20), new StandaloneDatabaseProvider(ctx));
        }
        CacheDataSource.Factory data = new CacheDataSource.Factory()
            .setCache(cache)
            // each stream fetched as the same YouTube app that asked for it (YouTube refuses a mismatch)
            .setUpstreamDataSourceFactory(new androidx.media3.datasource.ResolvingDataSource.Factory(
                new DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true),
                spec -> spec.withAdditionalHeaders(java.util.Collections.singletonMap("User-Agent", uaFor(spec.uri.toString())))))
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
        exo = new ExoPlayer.Builder(ctx)
            // DefaultDataSource: https through the cache above, downloaded songs (file://) straight from disk
            .setMediaSourceFactory(new DefaultMediaSourceFactory(ctx).setDataSourceFactory(new DefaultDataSource.Factory(ctx, data)))
            // ponytail: 50s ahead, start after 1.5s of audio, 3s after a stall; raise the last two on bad networks
            .setLoadControl(new DefaultLoadControl.Builder().setBufferDurationsMs(50_000, 50_000, 1_500, 3_000).build())
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setWakeMode(C.WAKE_MODE_NETWORK)
            .build();
        exo.setRepeatMode(repeatOne ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
        exo.setVolume(baseVolume);
        attachEq(exo.getAudioSessionId());
        main.post(fade);
        exo.addListener(new Player.Listener() {
            @Override
            public void onAudioSessionIdChanged(int audioSessionId) {
                attachEq(audioSessionId); // the equalizer follows the player's audio session
            }

            @Override
            public void onMediaItemTransition(MediaItem item, int reason) {
                if (reason != Player.MEDIA_ITEM_TRANSITION_REASON_AUTO || item == null) return;
                // gapless: already playing the preloaded song, so tell the page to move its queue along
                if (autoAdvanced != null) passed.add(autoAdvanced); // the page hadn't confirmed that one yet
                autoAdvanced = item.mediaId;
                exo.removeMediaItems(0, exo.getCurrentMediaItemIndex());
                emit("ended", -1);
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) emit("ended", -1);
                else if (state == Player.STATE_READY) emitTime(); // the real length, also with the screen off
            }

            @Override
            public void onPlayerError(PlaybackException e) {
                emit("error", -1); // the page gets a fresh link and resumes, or skips
            }

            @Override
            public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
                // another app took the audio for good, or the headphones came out
                if (!playWhenReady && (reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_FOCUS_LOSS
                    || reason == Player.PLAY_WHEN_READY_CHANGE_REASON_AUDIO_BECOMING_NOISY)) emit("pause", -1);
            }
        });
        if (resumed) main.post(tick);
        return exo;
    }

    private void emitTime() {
        MediaItem item = exo.getCurrentMediaItem();
        JSObject o = new JSObject();
        o.put("type", "time");
        o.put("key", item == null ? "" : item.mediaId);
        o.put("position", exo.getCurrentPosition() / 1000.0);
        long d = exo.getDuration();
        if (d != C.TIME_UNSET) o.put("duration", d / 1000.0);
        notifyListeners("action", o);
    }

    // no clock ticks to the page while it's off screen: nobody sees them (the lock screen runs its own)
    @Override
    protected void handleOnPause() {
        resumed = false;
        main.removeCallbacks(tick);
    }

    @Override
    protected void handleOnResume() {
        resumed = true;
        main.removeCallbacks(tick);
        if (exo != null) main.post(tick);
    }

    /** a YouTube stream, or one of our own downloads; nothing else from the page */
    private boolean playable(String url) {
        if (url == null) return false;
        if (url.startsWith("https://")) return true;
        return url.startsWith("file://") && !url.contains("..") && url.startsWith(android.net.Uri.fromFile(downloads()).toString());
    }

    private static MediaItem item(String url, String key) {
        // cache by song + format, not by URL: YouTube hands out a new URL for the same file every time
        return new MediaItem.Builder().setUri(url).setMediaId(key).setCustomCacheKey(key).build();
    }

    @PluginMethod
    public void play(final PluginCall call) {
        final String url = call.getString("url", "");
        final String key = call.getString("key", "");
        final long at = Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000));
        final boolean play = Boolean.TRUE.equals(call.getBoolean("playing", true));
        if (!playable(url) || key == null || key.isEmpty()) {
            call.reject("bad stream");
            return;
        }
        main.post(() -> {
            if (at == 0 && passed.remove(key)) { // the page catching up on a song already played through
                call.resolve();
                return;
            }
            passed.clear(); // any other request: the page is in step again
            ExoPlayer p = player();
            MediaItem cur = p.getCurrentMediaItem();
            boolean handedOver = key.equals(autoAdvanced) && at == 0 && cur != null && key.equals(cur.mediaId)
                && p.getPlaybackState() != Player.STATE_IDLE && p.getPlaybackState() != Player.STATE_ENDED;
            autoAdvanced = null;
            if (!handedOver) {
                p.setMediaItem(item(url, key), at);
                p.prepare();
            }
            p.setPlayWhenReady(play);
            if (handedOver) emitTime(); // the page now listens for this song: give it the length and position
            call.resolve();
        });
    }

    /** The songs after this one that the native player can play on its own (Your Music, downloads), in queue
     *  order: it rolls through them gaplessly even if the page is slow or asleep, and reports each change-over
     *  ("ended") so the page's queue follows. Empty = nothing queued. */
    @PluginMethod
    public void setNext(final PluginCall call) {
        final com.getcapacitor.JSArray items = call.getArray("items", new com.getcapacitor.JSArray());
        main.post(() -> {
            if (exo != null && exo.getMediaItemCount() > 0) {
                int after = exo.getCurrentMediaItemIndex() + 1;
                if (exo.getMediaItemCount() > after) exo.removeMediaItems(after, exo.getMediaItemCount());
                for (int i = 0; i < items.length(); i++) {
                    org.json.JSONObject o = items.optJSONObject(i);
                    if (o == null) break;
                    String url = o.optString("url"), key = o.optString("key");
                    if (!playable(url) || key.isEmpty()) break; // keep queue order: stop at the first gap
                    exo.addMediaItem(item(url, key));
                }
            }
            call.resolve();
        });
    }

    private boolean repeatOne = false; // applied when the native player is created, too

    /** Repeat One for native songs: the player loops the song itself, no round trip through the page. */
    @PluginMethod
    public void setRepeatOne(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        main.post(() -> {
            repeatOne = on;
            if (exo != null) exo.setRepeatMode(on ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
            call.resolve();
        });
    }

    // Sleep timer, kept here so it fires on time with the screen off even if the page's timers are slowed down.
    // At the time: pause the native player and tell the page ("pause"), which pauses YouTube songs and
    // clears its own timer. at = epoch ms, 0 = off.
    private final Runnable sleepNow = () -> {
        if (exo != null) exo.setPlayWhenReady(false);
        emit("pause", -1);
    };

    @PluginMethod
    public void setSleep(final PluginCall call) {
        final long at = Math.round(call.getDouble("at", 0.0));
        main.post(() -> {
            main.removeCallbacks(sleepNow);
            long wait = at - System.currentTimeMillis();
            if (at > 0) main.postDelayed(sleepNow, Math.max(0, wait));
            call.resolve();
        });
    }

    @PluginMethod
    public void setPlaying(final PluginCall call) {
        final boolean play = Boolean.TRUE.equals(call.getBoolean("playing", false));
        main.post(() -> {
            if (exo != null) exo.setPlayWhenReady(play);
            call.resolve();
        });
    }

    @PluginMethod
    public void seek(final PluginCall call) {
        final long to = Math.max(0, Math.round(call.getDouble("position", 0.0) * 1000));
        main.post(() -> {
            if (exo != null) exo.seekTo(to); // after the end too: ExoPlayer then plays again (Repeat One)
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(final PluginCall call) {
        final float v = (float) Math.max(0, Math.min(1, call.getDouble("volume", 1.0)));
        main.post(() -> {
            baseVolume = v;
            player().setVolume(v);
            call.resolve();
        });
    }

    /** Stop the engine without touching the notification (the next song is a Your Music file, or none). */
    @PluginMethod
    public void unload(final PluginCall call) {
        main.post(() -> {
            if (exo != null) {
                exo.stop();
                exo.clearMediaItems();
            }
            autoAdvanced = null;
            passed.clear();
            call.resolve();
        });
    }

    // Downloads, like Apple Music / BitChord: stored inside the app (getFilesDir), not in the phone's
    // storage. The Files / Music apps don't see them, Android never clears them on its own, and
    // uninstalling Mimo removes them. One file per song: <trackId>.audio.
    private java.io.File downloads() {
        return new java.io.File(getContext().getFilesDir(), "downloads");
    }

    private java.io.File downloadFile(String trackId) {
        return trackId != null && trackId.matches("[A-Za-z0-9:_.-]{1,80}") && !trackId.contains("..")
            ? new java.io.File(downloads(), trackId.replace(':', '_') + ".audio") : null;
    }

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url", "");
        final java.io.File out = downloadFile(call.getString("trackId"));
        if (out == null || url == null || !url.startsWith("https://")) {
            call.reject("bad download");
            return;
        }
        dl.submit(() -> {
            java.io.File part = new java.io.File(out.getPath() + ".part");
            HttpURLConnection c = null;
            try {
                downloads().mkdirs();
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent", uaFor(url));
                try (InputStream in = c.getInputStream(); java.io.FileOutputStream o = new java.io.FileOutputStream(part)) {
                    byte[] buf = new byte[64 * 1024];
                    for (int n; (n = in.read(buf)) > 0; ) o.write(buf, 0, n);
                }
                if (part.length() < 10_000 || !part.renameTo(out)) throw new java.io.IOException("download incomplete");
                JSObject r = new JSObject();
                r.put("url", android.net.Uri.fromFile(out).toString());
                r.put("bytes", out.length());
                call.resolve(r);
            } catch (Exception e) {
                part.delete();
                call.reject("download failed", e);
            } finally {
                if (c != null) c.disconnect();
            }
        });
    }

    /** the downloaded file's URL, or nothing when it isn't on the phone (any more) */
    @PluginMethod
    public void downloaded(PluginCall call) {
        java.io.File f = downloadFile(call.getString("trackId"));
        JSObject r = new JSObject();
        if (f != null && f.isFile()) r.put("url", android.net.Uri.fromFile(f).toString());
        call.resolve(r);
    }

    @PluginMethod
    public void deleteDownload(PluginCall call) {
        java.io.File f = downloadFile(call.getString("trackId"));
        if (f != null) f.delete();
        call.resolve();
    }

    private static long dirSize(java.io.File dir) {
        long n = 0;
        java.io.File[] all = dir.listFiles();
        if (all != null) for (java.io.File f : all) n += f.isDirectory() ? dirSize(f) : f.length();
        return n;
    }

    /** bytes: the streaming cache, and the songs kept inside the app (downloads + Your Music copies) */
    @PluginMethod
    public void storage(PluginCall call) {
        JSObject r = new JSObject();
        r.put("cache", dirSize(new java.io.File(getContext().getApplicationContext().getCacheDir(), "audio")));
        r.put("downloads", dirSize(downloads()));
        call.resolve(r);
    }

    /** Empty the streaming cache (songs kept in the app are untouched). */
    @PluginMethod
    public void clearCache(final PluginCall call) {
        main.post(() -> {
            try {
                if (cache != null) {
                    for (String key : new java.util.ArrayList<>(cache.getKeys())) cache.removeResource(key);
                } else {
                    java.io.File[] all = new java.io.File(getContext().getApplicationContext().getCacheDir(), "audio").listFiles();
                    if (all != null) for (java.io.File f : all) if (f.isFile()) f.delete();
                }
            } catch (RuntimeException ignored) {
                // a file in use: it goes next time
            }
            call.resolve();
        });
    }

    /** "Erase library": every download goes too */
    @PluginMethod
    public void deleteAllDownloads(PluginCall call) {
        java.io.File[] all = downloads().listFiles();
        if (all != null) for (java.io.File f : all) f.delete();
        call.resolve();
    }

    // ── Crossfade (native songs): the end of a song fades out and the next one fades in, back to back (they
    // don't overlap). ponytail: one player, so a fade rather than a true overlap; a second player would allow it.
    private float baseVolume = 1f;
    private int fadeMs = 0;
    private final Runnable fade = new Runnable() {
        @Override
        public void run() {
            if (exo != null && fadeMs > 0 && exo.isPlaying()) {
                long pos = exo.getCurrentPosition(), dur = exo.getDuration();
                float k = 1f;
                if (pos < fadeMs) k = pos / (float) fadeMs;
                if (dur != C.TIME_UNSET && dur > 2L * fadeMs && dur - pos < fadeMs) k = Math.min(k, (dur - pos) / (float) fadeMs);
                exo.setVolume(baseVolume * Math.max(0f, Math.min(1f, k)));
            } else if (exo != null && fadeMs == 0 && exo.getVolume() != baseVolume) exo.setVolume(baseVolume);
            main.postDelayed(this, 80);
        }
    };

    /** seconds: 0 = off, up to 12 */
    @PluginMethod
    public void setFade(final PluginCall call) {
        final int ms = (int) Math.max(0, Math.min(12_000, Math.round(call.getDouble("seconds", 0.0) * 1000)));
        main.post(() -> {
            fadeMs = ms;
            getContext().getSharedPreferences("mimo", Context.MODE_PRIVATE).edit().putInt("fadeMs", ms).apply();
            call.resolve();
        });
    }

    // ── Equalizer (native songs): Android's own, on the native player's audio session. YouTube songs play in the
    // web view, which has no session to attach to. Settings are kept on the phone and come back with the player.
    private android.media.audiofx.Equalizer eq;
    private boolean eqOn = false;
    private String eqLevels = ""; // "level,level,…" in millibels, one per band
    private int eqPreset = -1;

    private void attachEq(int sessionId) {
        releaseEq();
        if (sessionId == C.AUDIO_SESSION_ID_UNSET || sessionId == 0) return;
        attachLevel(sessionId);
        try {
            eq = new android.media.audiofx.Equalizer(0, sessionId);
            applyEq();
        } catch (RuntimeException e) {
            eq = null; // some phones don't offer an equalizer to apps; music plays untouched
        }
    }

    private void releaseEq() {
        releaseLevel();
        if (eq != null) {
            try {
                eq.release();
            } catch (RuntimeException ignored) {}
            eq = null;
        }
    }

    private void applyEq() {
        if (eq == null) return;
        try {
            if (eqPreset >= 0 && eqPreset < eq.getNumberOfPresets()) eq.usePreset((short) eqPreset);
            else if (!eqLevels.isEmpty()) {
                String[] lv = eqLevels.split(",");
                for (short b = 0; b < eq.getNumberOfBands() && b < lv.length; b++) eq.setBandLevel(b, Short.parseShort(lv[b].trim()));
            }
            eq.setEnabled(eqOn);
        } catch (RuntimeException ignored) {
            // a bad saved value: leave the equalizer as it is
        }
    }

    private JSObject eqState() {
        JSObject r = new JSObject();
        r.put("available", eq != null);
        r.put("enabled", eqOn);
        r.put("preset", eqPreset);
        if (eq == null) return r;
        short[] range = eq.getBandLevelRange();
        r.put("min", range[0]);
        r.put("max", range[1]);
        com.getcapacitor.JSArray bands = new com.getcapacitor.JSArray();
        for (short b = 0; b < eq.getNumberOfBands(); b++) {
            JSObject o = new JSObject();
            o.put("hz", eq.getCenterFreq(b) / 1000);
            o.put("level", eq.getBandLevel(b));
            bands.put(o);
        }
        r.put("bands", bands);
        com.getcapacitor.JSArray presets = new com.getcapacitor.JSArray();
        for (short i = 0; i < eq.getNumberOfPresets(); i++) presets.put(eq.getPresetName(i));
        r.put("presets", presets);
        return r;
    }

    // ── Loudness levelling (native songs, Android 9+): a gentle compressor lifts quiet passages and tames loud
    // ones, and a limiter stops anything clipping, so songs play at about the same level. It works live, as the
    // song plays (no per-song measuring like Spotify's), so it's close to, not exactly, normalisation.
    // ponytail: fixed curve (threshold -26 dB, ratio 3:1, +8 dB make-up, limit -2 dB); tune here if songs pump
    private android.media.audiofx.DynamicsProcessing level;
    private boolean levelOn = false;

    private void attachLevel(int sessionId) {
        releaseLevel();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
        try {
            android.media.audiofx.DynamicsProcessing.Config cfg = new android.media.audiofx.DynamicsProcessing.Config.Builder(
                android.media.audiofx.DynamicsProcessing.VARIANT_FAVOR_FREQUENCY_RESOLUTION, 2,
                false, 0, true, 1, false, 0, true).build();
            level = new android.media.audiofx.DynamicsProcessing(0, sessionId, cfg);
            level.setMbcBandAllChannelsTo(0, new android.media.audiofx.DynamicsProcessing.MbcBand(
                true, 20000f, 10f, 250f, 3f, -26f, 6f, -90f, 1f, 0f, 8f));
            level.setLimiterAllChannelsTo(new android.media.audiofx.DynamicsProcessing.Limiter(
                true, true, 0, 1f, 60f, 10f, -2f, 0f));
            level.setEnabled(levelOn);
        } catch (RuntimeException e) {
            level = null; // this phone doesn't offer it to apps: music plays untouched
        }
    }

    private void releaseLevel() {
        if (level != null) {
            try {
                level.release();
            } catch (RuntimeException ignored) {}
            level = null;
        }
    }

    /** on/off; answers whether this phone supports it */
    @PluginMethod
    public void setLevel(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        main.post(() -> {
            levelOn = on;
            getContext().getSharedPreferences("mimo", Context.MODE_PRIVATE).edit().putBoolean("levelOn", on).apply();
            if (level == null && exo != null) attachLevel(exo.getAudioSessionId());
            if (level != null) {
                try {
                    level.setEnabled(on);
                } catch (RuntimeException ignored) {}
            }
            JSObject r = new JSObject();
            r.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P);
            call.resolve(r);
        });
    }

    /** bands (Hz + current level), level range, the phone's presets, on/off */
    @PluginMethod
    public void eqInfo(final PluginCall call) {
        main.post(() -> {
            if (eq == null) attachEq(player().getAudioSessionId());
            call.resolve(eqState());
        });
    }

    /** any of: enabled, preset (index, -1 = custom), levels (millibels per band) */
    @PluginMethod
    public void setEq(final PluginCall call) {
        main.post(() -> {
            if (eq == null) attachEq(player().getAudioSessionId());
            if (call.getData().has("enabled")) eqOn = Boolean.TRUE.equals(call.getBoolean("enabled", false));
            if (call.getData().has("preset")) eqPreset = call.getInt("preset", -1);
            com.getcapacitor.JSArray lv = call.getArray("levels", null);
            if (lv != null) {
                StringBuilder sb = new StringBuilder();
                for (int i = 0; i < lv.length(); i++) sb.append(i > 0 ? "," : "").append(lv.optInt(i));
                eqLevels = sb.toString();
                eqPreset = -1; // moving a band makes it a custom setting
            }
            applyEq();
            getContext().getSharedPreferences("mimo", Context.MODE_PRIVATE).edit()
                .putBoolean("eqOn", eqOn).putString("eqLevels", eqLevels).putInt("eqPreset", eqPreset).apply();
            call.resolve(eqState());
        });
    }

    // Audio-only streams, like BitChord / NewPipe: ask YouTube's player API for a video's formats as its
    // Android VR app does (that client gets plain URLs, no signature to decode) and return the best
    // audio-only one. The page plays it in a plain <audio>: no video decoder, ~4x less data.
    // ponytail: client name/version are what YouTube accepts today; if every song starts failing, bump
    // VR_VERSION (yt-dlp's youtube extractor lists the current one).
    static final String VR_VERSION = "1.65.10";
    /** mobile data: stay under this bitrate (bits/s). Long.MAX_VALUE = always best quality. */
    static final long DATA_SAVER_BPS = 80_000;
    static final String VR_UA = "com.google.android.apps.youtube.vr.oculus/" + VR_VERSION
        + " (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

    @PluginMethod
    public void audioUrl(final PluginCall call) {
        final String id = call.getString("videoId", "");
        if (id == null || !id.matches("[A-Za-z0-9_-]{11}")) {
            call.reject("bad video id");
            return;
        }
        io.submit(() -> {
            // each client in turn: if YouTube refuses one (old version, "sign in to confirm you're not a bot"),
            // the next one often still works. The first refusal's reason is what the page shows.
            String why = null;
            for (String[] cl : CLIENTS) {
                try {
                    org.json.JSONObject res = player(id, cl);
                    JSObject r = pick(res, Boolean.TRUE.equals(call.getBoolean("best", false)), cl[5]);
                    if (r != null) {
                        r.put("key", id + "." + r.getString("itag") + "." + r.getString("mod"));
                        call.resolve(r);
                        return;
                    }
                    org.json.JSONObject ps = res.optJSONObject("playabilityStatus");
                    if (why == null) why = ps == null ? "YouTube sent no audio" : ps.optString("reason", ps.optString("status", "YouTube sent no audio"));
                } catch (Exception e) {
                    if (why == null) why = e.getClass().getSimpleName() + ": " + e.getMessage();
                }
            }
            call.reject(why == null ? "no audio" : why);
        });
    }

    // name, version, client-name id, device make, device model, user agent, os name, os version, android sdk
    // ponytail: these are what YouTube accepts today; when every song fails, bump the versions (yt-dlp's
    // youtube extractor lists the current ones)
    static final String[][] CLIENTS = {
        { "ANDROID_VR", VR_VERSION, "28", "Oculus", "Quest 3", VR_UA, "Android", "12L", "32" },
        { "IOS", "20.10.4", "5", "Apple", "iPhone16,2",
          "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)", "iPhone", "18.3.2.22D82", "" },
    };

    /** The app a stream URL was handed to (its "c=" parameter), so the download looks like that app. */
    static String uaFor(String url) {
        for (String[] cl : CLIENTS) if (url.contains("c=" + cl[0] + "&") || url.endsWith("c=" + cl[0])) return cl[5];
        return VR_UA;
    }

    /** YouTube's player answer for one video, asked as client `cl`. Throws with the HTTP status on a refusal. */
    private org.json.JSONObject player(String id, String[] cl) throws Exception {
        org.json.JSONObject client = new org.json.JSONObject()
            .put("clientName", cl[0]).put("clientVersion", cl[1])
            .put("deviceMake", cl[3]).put("deviceModel", cl[4]).put("osName", cl[6]).put("osVersion", cl[7]).put("hl", "en");
        if (!cl[8].isEmpty()) client.put("androidSdkVersion", Integer.parseInt(cl[8]));
        String body = new org.json.JSONObject()
            .put("context", new org.json.JSONObject().put("client", client))
            .put("videoId", id).put("contentCheckOk", true).put("racyCheckOk", true).toString();
        HttpURLConnection c = (HttpURLConnection) new URL("https://www.youtube.com/youtubei/v1/player?prettyPrint=false").openConnection();
        try {
            c.setConnectTimeout(10000);
            c.setReadTimeout(10000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            c.setRequestProperty("User-Agent", cl[5]);
            c.setRequestProperty("X-YouTube-Client-Name", cl[2]);
            c.setRequestProperty("X-YouTube-Client-Version", cl[1]);
            try (java.io.OutputStream o = c.getOutputStream()) {
                o.write(body.getBytes("UTF-8"));
            }
            int status = c.getResponseCode();
            if (status != 200) throw new java.io.IOException("YouTube answered " + status);
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            try (InputStream in = c.getInputStream()) {
                byte[] buf = new byte[16384];
                for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
            }
            return new org.json.JSONObject(out.toString("UTF-8"));
        } finally {
            c.disconnect();
        }
    }

    /** The best audio-only format with a direct URL, or null. Opus ~130-160 kbps on Wi-Fi; on mobile data (a
     *  metered network) the best one under DATA_SAVER_BPS when there is one; downloads (`best`) always the best. */
    private JSObject pick(org.json.JSONObject res, boolean bestQuality, String ua) throws org.json.JSONException {
        org.json.JSONObject sd = res.optJSONObject("streamingData");
        org.json.JSONArray formats = sd == null ? null : sd.optJSONArray("adaptiveFormats");
        android.net.ConnectivityManager cm = (android.net.ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        boolean metered = false;
        try {
            metered = cm != null && cm.isActiveNetworkMetered();
        } catch (RuntimeException ignored) {
            // can't tell: best quality
        }
        long cap = !bestQuality && metered ? DATA_SAVER_BPS : Long.MAX_VALUE;
        org.json.JSONObject best = null;
        for (int i = 0; formats != null && i < formats.length(); i++) {
            org.json.JSONObject f = formats.getJSONObject(i);
            if (!f.optString("mimeType").startsWith("audio/") || f.optString("url").isEmpty()) continue;
            long b = f.optLong("bitrate");
            long bb = best == null ? 0 : best.optLong("bitrate");
            // under the cap beats over it; then the higher bitrate (or, if all are over, the lower)
            if (best == null || (b <= cap ? (bb > cap || b > bb) : (bb > cap && b < bb))) best = f;
        }
        if (best == null) return null;
        JSObject r = new JSObject();
        r.put("url", best.getString("url"));
        r.put("ua", ua); // the stream must be fetched as the same app that asked for it
        r.put("itag", String.valueOf(best.optInt("itag")));
        r.put("mod", best.optString("lastModified"));
        return r;
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
                MimoWidget.refresh(getContext(), title, artist, playing, art, true);
            });
        });
    }

    @Override
    protected void handleOnDestroy() {
        holdLocks(false);
        main.removeCallbacks(tick);
        main.removeCallbacks(sleepNow);
        if (exo != null) exo.release();
        exo = null;
        if (session != null) session.setActive(false); // shared with Android Auto: kept, just inactive
        MimoWidget.refresh(getContext(), title, artist, false, null, false); // app closed: the widget's buttons open it
        releaseEq();
        main.removeCallbacks(fade);
        if (serviceRunning) getContext().stopService(new Intent(getContext(), MimoPlaybackService.class));
        io.shutdownNow();
        dl.shutdownNow();
        instance = null;
    }
}
