package com.mimo.app.playback

import android.app.PendingIntent
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.PowerManager
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.mimo.app.MainActivity
import com.mimo.app.data.App

/**
 * Owns the YouTube player and its MediaSession. Media3 runs this as a foreground service while music
 * plays and builds the media notification itself (art, title, ⏮ ⏯ ⏭), so Android keeps Mimo alive
 * with the screen off. Replaces MimoPlaybackService + most of MimoMediaPlugin from the Capacitor app.
 */
@UnstableApi
class PlaybackService : MediaSessionService() {

    private var session: MediaSession? = null
    private var listening: Listening? = null
    private lateinit var cpu: PowerManager.WakeLock
    private lateinit var wifi: WifiManager.WifiLock

    override fun onCreate() {
        super.onCreate()
        // The WebView streams on its own, outside ExoPlayer's wake handling: hold the CPU and Wi-Fi awake
        // while playing, or the stream runs dry with the screen off and you hear gaps (same as the old plugin).
        cpu = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "mimo:playback")
            .apply { setReferenceCounted(false) }
        @Suppress("DEPRECATION") // WIFI_MODE_FULL_HIGH_PERF is the one that works below API 29
        wifi = (applicationContext.getSystemService(WIFI_SERVICE) as WifiManager)
            .createWifiLock(if (android.os.Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF, "mimo:playback")
            .apply { setReferenceCounted(false) }

        val app = App.get(this)
        val yt = app.youtube
        val player = YouTubePlayer(
            this,
            resolve = { item -> item.track()?.let { yt.findVideo(it) } },
            onBlocked = { item -> yt.forget(item.mediaId) },
        )
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying) { cpu.acquire(4 * 60 * 60 * 1000L); wifi.acquire() }
                else { if (cpu.isHeld) cpu.release(); if (wifi.isHeld) wifi.release() }
            }
        })
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        session = MediaSession.Builder(this, player).setSessionActivity(open).build()
        listening = Listening(app, player)
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    // Swiped away from recents: keep going if music is playing, otherwise shut down.
    override fun onTaskRemoved(rootIntent: Intent?) {
        val p = session?.player
        if (p == null || !p.playWhenReady || p.mediaItemCount == 0) stopSelf()
    }

    override fun onDestroy() {
        listening?.release()
        session?.run { player.release(); release() }
        session = null
        if (cpu.isHeld) cpu.release()
        if (wifi.isHeld) wifi.release()
        super.onDestroy()
    }
}
