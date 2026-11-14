package com.mimo.app.playback

import android.content.Context
import android.os.Looper
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/** YT.PlayerState → Media3 playback state. Pure, tested in YouTubePlayerTest. */
fun mediaState(yt: Int, hasItems: Boolean, playWhenReady: Boolean): Int = when {
    !hasItems -> Player.STATE_IDLE
    yt == 1 || yt == 2 || yt == 5 -> Player.STATE_READY
    yt == 0 -> Player.STATE_ENDED
    else -> if (playWhenReady) Player.STATE_BUFFERING else Player.STATE_READY // -1 unstarted, 3 buffering
}

/** Errors where the next song should just play instead (removed, private, embedding blocked). */
fun skippable(code: Int) = code == 2 || code == 100 || code == 101 || code == 150

/**
 * A Media3 Player backed by the YouTube IFrame player. Each MediaItem carries a catalogue Track (Items.kt);
 * `resolve` finds its YouTube video right before it plays. Because it's a real Media3 Player, MediaSession
 * gives the notification, lock screen, Bluetooth and Android Auto controls with no extra code.
 */
@UnstableApi
class YouTubePlayer(
    context: Context,
    private val resolve: suspend (MediaItem) -> String?, // video id, null = nothing playable
    private val onBlocked: (MediaItem) -> Unit = {}, // the video turned out removed/private/not embeddable
) : SimpleBasePlayer(Looper.getMainLooper()), YouTubeEngine.Listener {

    private class Entry(val item: MediaItem) // its identity is the playlist uid Media3 asks for

    private val scope = MainScope()
    private var loading: Job? = null
    private val engine = YouTubeEngine(context, this)
    private var queue = listOf<Entry>()
    private var index = 0
    private var playWhenReady = false
    private var prepared = false
    private var yt = -1
    private var positionMs = 0L
    private var durationMs = C.TIME_UNSET
    private var error: PlaybackException? = null
    private var repeat = REPEAT_MODE_OFF

    private val commands = Player.Commands.Builder().addAll(
        COMMAND_PLAY_PAUSE, COMMAND_PREPARE, COMMAND_STOP, COMMAND_RELEASE,
        COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM, COMMAND_SEEK_TO_DEFAULT_POSITION, COMMAND_SEEK_TO_MEDIA_ITEM,
        COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
        COMMAND_SET_MEDIA_ITEM, COMMAND_CHANGE_MEDIA_ITEMS, COMMAND_SET_REPEAT_MODE,
        COMMAND_GET_CURRENT_MEDIA_ITEM, COMMAND_GET_TIMELINE, COMMAND_GET_METADATA,
    ).build()

    override fun getState(): State {
        val playlist = queue.mapIndexed { i, e ->
            MediaItemData.Builder(e).setMediaItem(e.item)
                .setDurationUs(if (i == index && durationMs > 0) durationMs * 1000 else C.TIME_UNSET)
                .build()
        }
        val playing = prepared && playWhenReady && yt == 1
        return State.Builder()
            .setAvailableCommands(commands)
            .setPlayWhenReady(playWhenReady, PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(if (prepared) mediaState(yt, queue.isNotEmpty(), playWhenReady) else STATE_IDLE)
            .setPlaylist(playlist)
            .setCurrentMediaItemIndex(index)
            .setContentPositionMs(PositionSupplier.getExtrapolating(positionMs, if (playing) 1f else 0f))
            .setPlayerError(error)
            .setRepeatMode(repeat)
            .build()
    }

    // ── Commands from the UI, notification, headset ──────────────────────

    override fun handleSetRepeatMode(repeatMode: Int): ListenableFuture<*> {
        repeat = repeatMode
        return done()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        this.playWhenReady = playWhenReady
        if (playWhenReady) engine.play() else engine.pause()
        return done()
    }

    override fun handlePrepare(): ListenableFuture<*> {
        prepared = true
        error = null
        loadCurrent()
        return done()
    }

    override fun handleStop(): ListenableFuture<*> {
        prepared = false
        engine.stop()
        return done()
    }

    override fun handleRelease(): ListenableFuture<*> {
        scope.cancel()
        engine.destroy()
        return done()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        val pos = if (positionMs == C.TIME_UNSET) 0 else positionMs
        if (mediaItemIndex == index && seekCommand == COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM) {
            this.positionMs = pos
            engine.seek(pos)
        } else jump(mediaItemIndex, pos)
        return done()
    }

    override fun handleSetMediaItems(mediaItems: MutableList<MediaItem>, startIndex: Int, startPositionMs: Long): ListenableFuture<*> {
        queue = mediaItems.map(::Entry)
        jump(if (startIndex == C.INDEX_UNSET) 0 else startIndex, if (startPositionMs == C.TIME_UNSET) 0 else startPositionMs)
        return done()
    }

    override fun handleAddMediaItems(index: Int, mediaItems: MutableList<MediaItem>): ListenableFuture<*> {
        queue = queue.toMutableList().apply { addAll(index, mediaItems.map(::Entry)) }
        if (index <= this.index && queue.size > mediaItems.size) this.index += mediaItems.size
        return done()
    }

    override fun handleRemoveMediaItems(fromIndex: Int, toIndex: Int): ListenableFuture<*> {
        val current = queue.getOrNull(index)
        queue = queue.filterIndexed { i, _ -> i !in fromIndex until toIndex }
        val kept = queue.indexOf(current)
        if (kept >= 0) index = kept else jump(fromIndex.coerceAtMost(queue.size - 1).coerceAtLeast(0), 0)
        return done()
    }

    override fun handleMoveMediaItems(fromIndex: Int, toIndex: Int, newIndex: Int): ListenableFuture<*> {
        val current = queue.getOrNull(index)
        val moved = queue.subList(fromIndex, toIndex).toList()
        queue = (queue - moved.toSet()).toMutableList().apply { addAll(newIndex, moved) }
        index = queue.indexOf(current).coerceAtLeast(0)
        return done()
    }

    override fun handleReplaceMediaItems(fromIndex: Int, toIndex: Int, mediaItems: MutableList<MediaItem>): ListenableFuture<*> {
        val replacingCurrent = index in fromIndex until toIndex
        queue = queue.toMutableList().apply {
            subList(fromIndex, toIndex).clear()
            addAll(fromIndex, mediaItems.map(::Entry))
        }
        if (replacingCurrent) jump(index.coerceAtMost(queue.size - 1).coerceAtLeast(0), positionMs)
        return done()
    }

    // ── Events from the YouTube player ───────────────────────────────────

    override fun onReady() = invalidateState()

    override fun onState(state: Int) {
        yt = state
        if (state == 0) when { // ended
            repeat == REPEAT_MODE_ONE -> { positionMs = 0; engine.seek(0); engine.play() }
            index < queue.size - 1 -> jump(index + 1, 0)
            repeat == REPEAT_MODE_ALL && queue.isNotEmpty() -> jump(0, 0)
            else -> playWhenReady = false
        }
        invalidateState()
    }

    override fun onTime(positionMs: Long, durationMs: Long) {
        if (yt != 1 && yt != 2) return // between songs the old player's time is stale
        this.positionMs = positionMs
        if (durationMs > 0) this.durationMs = durationMs
        invalidateState()
    }

    override fun onError(code: Int) {
        if (skippable(code)) queue.getOrNull(index)?.let { onBlocked(it.item) }
        fail(if (skippable(code)) "This song isn't available on YouTube" else "YouTube error $code", skip = skippable(code))
    }

    private fun fail(message: String, skip: Boolean) {
        if (skip && index < queue.size - 1) jump(index + 1, 0)
        else {
            playWhenReady = false
            error = PlaybackException(message, null, PlaybackException.ERROR_CODE_REMOTE_ERROR)
        }
        invalidateState()
    }

    // ── helpers ──────────────────────────────────────────────────────────

    private fun jump(to: Int, startMs: Long) {
        index = to
        positionMs = startMs
        durationMs = C.TIME_UNSET
        yt = -1
        loadCurrent()
    }

    private fun loadCurrent() {
        val entry = queue.getOrNull(index) ?: return
        if (!prepared) return
        loading?.cancel() // a newer jump wins over a search still in flight
        engine.pause() // the previous song must not keep playing while the next one is looked up
        loading = scope.launch {
            val id = try {
                resolve(entry.item)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                return@launch fail(e.message ?: "Couldn't find this song on YouTube", skip = false)
            }
            if (queue.getOrNull(index) !== entry) return@launch
            if (id == null) fail("This song isn't available on YouTube", skip = true)
            else engine.load(id, positionMs, playWhenReady)
        }
    }

    private fun done() = Futures.immediateVoidFuture()
}
