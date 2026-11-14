package com.mimo.app.ui

import android.content.ComponentName
import android.content.Context
import androidx.compose.runtime.*
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.MoreExecutors
import com.mimo.app.data.Queue
import com.mimo.app.data.Repeat
import com.mimo.app.data.Track
import com.mimo.app.playback.PlaybackService
import com.mimo.app.playback.toMediaItem
import com.mimo.app.playback.track

/**
 * The screens' handle on the playback service. Reads are Compose state; actions go to the MediaController.
 * Queue ordering (Play Next vs Add to Queue, your queued block, shuffling only what's upcoming) uses the
 * tested rules in data/Queue.kt, then the result is applied to the service's playlist.
 */
class PlayerConnection(context: Context) : Player.Listener {
    private val future = MediaController.Builder(context, SessionToken(context, ComponentName(context, PlaybackService::class.java))).buildAsync()
    private var c: MediaController? = null

    var ready by mutableStateOf(false); private set
    var tracks by mutableStateOf(emptyList<Track>()); private set
    var index by mutableIntStateOf(-1); private set
    var isPlaying by mutableStateOf(false); private set
    var buffering by mutableStateOf(false); private set
    var durationMs by mutableLongStateOf(0L); private set
    var error by mutableStateOf<String?>(null); private set
    var repeat by mutableStateOf(Repeat.OFF); private set
    var shuffle by mutableStateOf(false); private set
    private var manual = 0 // songs right after the current one that you queued yourself

    val current: Track? get() = tracks.getOrNull(index)
    val positionMs: Long get() = c?.currentPosition ?: 0L

    init {
        future.addListener({
            c = future.get().also { it.addListener(this) }
            ready = true
            sync()
        }, MoreExecutors.directExecutor())
    }

    fun release() = MediaController.releaseFuture(future)

    override fun onEvents(player: Player, events: Player.Events) = sync()

    private fun sync() {
        val p = c ?: return
        val old = index
        tracks = (0 until p.mediaItemCount).mapNotNull { p.getMediaItemAt(it).track() }
        index = if (p.mediaItemCount == 0) -1 else p.currentMediaItemIndex
        // keep the "you queued these" block in step as songs advance (same rule as Queue.next/prev/jumpTo)
        if (old >= 0 && index != old) manual = when {
            index == old + 1 -> maxOf(0, manual - 1)
            index == old - 1 -> manual + 1
            index > old -> maxOf(0, manual - (index - old))
            else -> 0
        }
        manual = manual.coerceIn(0, maxOf(0, tracks.size - 1 - index))
        isPlaying = p.isPlaying
        buffering = p.playbackState == Player.STATE_BUFFERING && p.playWhenReady
        durationMs = p.duration.takeIf { it > 0 } ?: ((current?.duration ?: 0.0) * 1000).toLong()
        error = p.playerError?.message
        repeat = when (p.repeatMode) { Player.REPEAT_MODE_ALL -> Repeat.ALL; Player.REPEAT_MODE_ONE -> Repeat.ONE; else -> Repeat.OFF }
    }

    private fun q() = Queue(tracks, index, manual = manual, shuffle = shuffle)

    /** start -1 = first (or random when shuffling). */
    fun playList(list: List<Track>, start: Int = 0, shuffle: Boolean? = null) {
        val p = c ?: return
        val n = Queue(shuffle = this.shuffle).playList(list, start, shuffle)
        if (n.tracks.isEmpty()) return
        this.shuffle = n.shuffle
        manual = 0
        p.setMediaItems(n.tracks.map { it.toMediaItem() }, n.index, 0)
        p.prepare()
        p.play()
    }

    fun playNext(t: Track) = insert(t, q().playNext(t))
    fun addToQueue(t: Track) = insert(t, q().addToQueue(t))

    private fun insert(t: Track, n: Queue) {
        val p = c ?: return
        if (index < 0) return playList(listOf(t))
        val at = n.tracks.indexOfFirst { it === t } // our list is decoded from the service, so only the new one is `t`
        if (at < 0) return
        manual = n.manual
        p.addMediaItem(at, t.toMediaItem())
    }

    fun removeAt(i: Int) {
        val p = c ?: return
        if (i == index) return
        manual = q().removeAt(i).manual
        p.removeMediaItem(i)
    }

    fun move(from: Int, to: Int) {
        val p = c ?: return
        manual = q().move(from, to).manual
        p.moveMediaItem(from, to)
    }

    fun jumpTo(i: Int) { c?.run { seekTo(i, 0); play() } }
    fun toggle() { c?.run { if (isPlaying) pause() else { if (playbackState == Player.STATE_IDLE) prepare(); play() } } }
    fun pause() { c?.pause() }
    fun next() { c?.seekToNextMediaItem() }
    /** Back to the start if 3s+ in (like every player), else the previous song. */
    fun prev() { c?.run { if (currentPosition > 3000 || !hasPreviousMediaItem()) seekTo(0) else seekToPreviousMediaItem() } }
    fun seekTo(ms: Long) { c?.seekTo(ms) }

    fun cycleRepeat() {
        val p = c ?: return
        p.repeatMode = when (repeat) { Repeat.OFF -> Player.REPEAT_MODE_ALL; Repeat.ALL -> Player.REPEAT_MODE_ONE; Repeat.ONE -> Player.REPEAT_MODE_OFF }
    }

    /** Shuffles only what's after your queued songs; turning it off keeps the current order. */
    fun toggleShuffle() {
        val p = c ?: return
        val n = q().toggleShuffle()
        shuffle = n.shuffle
        val keep = index + 1 + manual
        if (n.shuffle && keep < tracks.size) p.replaceMediaItems(keep, tracks.size, n.tracks.drop(keep).map { it.toMediaItem() })
    }

    fun clearUpcoming() {
        val p = c ?: return
        if (index + 1 < tracks.size) p.removeMediaItems(index + 1, tracks.size)
        manual = 0
    }
}

val LocalPlayer = staticCompositionLocalOf<PlayerConnection> { error("no player") }
