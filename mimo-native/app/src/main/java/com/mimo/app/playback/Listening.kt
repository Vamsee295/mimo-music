package com.mimo.app.playback

import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import com.mimo.app.data.App
import com.mimo.app.data.Track
import com.mimo.app.data.mainArtist
import com.mimo.app.data.radioAfter
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Everything that happens around a song while it plays, in the service so it works with the app closed:
 * - Replay / stats: a play counts at 30s; listening time is added as it accrues.
 * - Taste: moving on within 15s is a skip, 30s+ is a listen (Smarter Autoplay ranks with this).
 * - Autoplay: when the last song in the queue starts, similar songs are added after it.
 * - Sleep timer: pauses at a time, or when the current song ends.
 */
class Listening(private val app: App, private val player: Player) : Player.Listener {

    private val main = Handler(Looper.getMainLooper())
    private val scope = MainScope()
    private var current: Track? = null
    private var heard = 0.0 // seconds of the current song actually played
    private var logged = false
    private var unsaved = 0.0 // listening seconds not written to the library yet
    private var autoplayFor: String? = null // seed already used, so one song triggers Autoplay once
    private val suggested = HashSet<String>() // songs Autoplay already offered this session

    private val tick = object : Runnable {
        override fun run() {
            if (player.isPlaying) {
                heard += 1; unsaved += 1
                val t = current
                if (t != null && !logged && heard >= 30) { logged = true; app.library.update { it.logPlay(t) } }
                if (unsaved >= 15) flush()
            }
            app.sleep.value.at?.let { if (System.currentTimeMillis() >= it) { player.pause(); app.sleep.value = SleepTimer() } }
            main.postDelayed(this, 1000)
        }
    }

    init {
        player.addListener(this)
        main.post(tick)
        onMediaItemTransition(player.currentMediaItem, Player.MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED)
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
        finishSong()
        current = mediaItem?.track()
        heard = 0.0; logged = false
        maybeAutoplay()
    }

    override fun onTimelineChanged(timeline: androidx.media3.common.Timeline, reason: Int) = maybeAutoplay()

    override fun onPlaybackStateChanged(state: Int) {
        if (state != Player.STATE_ENDED) return
        finishSong()
        current = null
    }

    override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
        // "end of song" sleep timer: the song finished on its own and the next one started → stop there
        if (reason == Player.DISCONTINUITY_REASON_AUTO_TRANSITION && app.sleep.value.afterSong) {
            player.pause()
            app.sleep.value = SleepTimer()
        }
    }

    private fun finishSong() {
        val t = current ?: return
        flush()
        if (heard >= 30) app.library.update { it.learnTaste(t, skipped = false) }
        else if (heard in 0.5..15.0) app.library.update { it.learnTaste(t, skipped = true) }
    }

    private fun flush() {
        val t = current ?: return
        if (unsaved <= 0) return
        val sec = unsaved
        unsaved = 0.0
        app.library.update { it.addPlaySeconds(t.id, sec).addListening(sec, mainArtist(t.artist)) }
    }

    private fun maybeAutoplay() {
        val seed = current ?: return
        if (!app.library.value.settings.autoplay || player.hasNextMediaItem() || autoplayFor == seed.id) return
        autoplayFor = seed.id
        val inQueue = (0 until player.mediaItemCount).mapTo(HashSet()) { player.getMediaItemAt(it).mediaId }
        val exclude = inQueue + if (app.library.value.settings.noRepeatAutoplay) suggested else emptySet()
        scope.launch {
            val picks = app.library.value.taste.rank(radioAfter(app.catalog, seed, exclude))
            if (picks.isEmpty() || player.currentMediaItem?.mediaId != seed.id) return@launch
            suggested += picks.map { it.id }
            player.addMediaItems(picks.map { it.toMediaItem() })
        }
    }

    fun release() {
        finishSong()
        main.removeCallbacks(tick)
        scope.cancel()
        player.removeListener(this)
    }
}

/** at = pause at this time (epoch ms); afterSong = pause when the current song ends. */
data class SleepTimer(val at: Long? = null, val afterSong: Boolean = false)
