package com.mimo.app.data

import kotlin.random.Random

enum class Repeat { OFF, ALL, ONE }

/**
 * The play queue. Port of lib/store.ts, pure and immutable: every action returns a new Queue.
 *
 * `manual` = how many songs right after the current one YOU queued (Play Next / Add to Queue). They play
 * before the rest of the album and before Autoplay's picks, in the order you added them.
 * `turn` goes up every time a song is started: the player reloads on that, not on the position, so
 * removing or dragging other songs never restarts what's playing.
 */
data class Queue(
    val tracks: List<Track> = emptyList(),
    val index: Int = -1, // -1 = nothing loaded
    val playing: Boolean = false,
    val shuffle: Boolean = false,
    val repeat: Repeat = Repeat.OFF,
    val sleepAt: Long? = null, // epoch ms when playback pauses
    val sleepAfterTrack: Boolean = false,
    val manual: Int = 0,
    val turn: Int = 0,
) {
    val current: Track? get() = tracks.getOrNull(index)

    /** start -1 = first (or random if shuffling); shuffle on keeps the clicked song first. */
    fun playList(list: List<Track>, start: Int, shuffle: Boolean? = null, rnd: Random = Random): Queue {
        if (list.isEmpty()) return this
        val sh = shuffle ?: this.shuffle
        val s = if (start < 0) (if (sh) rnd.nextInt(list.size) else 0) else start
        val q = if (sh) listOf(list[s]) + list.filterIndexed { i, _ -> i != s }.shuffled(rnd) else list
        return copy(tracks = q, index = if (sh) 0 else s, playing = true, shuffle = sh, manual = 0, turn = turn + 1)
    }

    /** Straight after the current song. */
    fun playNext(t: Track): Queue {
        if (index < 0) return startWith(t)
        return copy(tracks = tracks.insert(index + 1, t), manual = manual + 1)
    }

    /** After the songs you already queued, but before the rest of the album / Autoplay's picks. */
    fun addToQueue(t: Track): Queue {
        if (index < 0) return startWith(t)
        return copy(tracks = tracks.insert(index + 1 + manual, t), manual = manual + 1)
    }

    /** Autoplay: add to the end without changing what's playing. */
    fun appendMany(ts: List<Track>) = if (ts.isEmpty()) this else copy(tracks = tracks + ts)

    fun removeAt(i: Int): Queue {
        if (i == index || i !in tracks.indices) return this // can't remove what's playing
        val mine = i > index && i <= index + manual
        return copy(tracks = tracks.filterIndexed { j, _ -> j != i }, index = if (i < index) index - 1 else index, manual = manual - if (mine) 1 else 0)
    }

    fun move(from: Int, to: Int): Queue {
        if (from == to || from !in tracks.indices || to !in tracks.indices) return this
        val q = tracks.toMutableList().apply { add(to, removeAt(from)) }
        // by position, not by looking the song up: the same song can be in the queue twice
        val ni = when {
            from == index -> to
            from < index && to >= index -> index - 1
            from > index && to <= index -> index + 1
            else -> index
        }
        // dragging a song into (or out of) your queued block makes it yours (or not)
        var m = manual - if (from > index && from <= index + manual) 1 else 0
        if (from != index && to > ni && to <= ni + m + 1) m++
        return copy(tracks = q, index = ni, manual = m.coerceIn(0, maxOf(0, q.size - 1 - ni)))
    }

    fun jumpTo(i: Int) = copy(index = i, playing = true, manual = if (i > index) maxOf(0, manual - (i - index)) else 0, turn = turn + 1)

    fun clearUpcoming() = copy(tracks = tracks.take(index + 1), manual = 0)

    fun next(auto: Boolean = false): Queue = when {
        auto && sleepAfterTrack -> copy(playing = false, sleepAfterTrack = false)
        index < tracks.size - 1 -> copy(index = index + 1, playing = true, manual = maxOf(0, manual - 1), turn = turn + 1)
        repeat == Repeat.ALL || !auto -> copy(index = 0, playing = if (auto) true else playing, manual = 0, turn = turn + 1)
        else -> copy(playing = false)
    }

    fun prev() = if (index > 0) copy(index = index - 1, manual = manual + 1, turn = turn + 1) else this

    /** Shuffles only what's upcoming, after the songs you queued; the current song never moves. */
    fun toggleShuffle(rnd: Random = Random): Queue {
        if (!shuffle && index >= 0) {
            val keep = index + 1 + manual
            return copy(tracks = tracks.take(keep) + tracks.drop(keep).shuffled(rnd), shuffle = true)
        }
        return copy(shuffle = !shuffle)
    }

    fun cycleRepeat() = copy(repeat = Repeat.entries[(repeat.ordinal + 1) % 3]) // off → all → one

    /** minutes, or null = off. */
    fun setSleep(minutes: Int?, now: Long = System.currentTimeMillis()) =
        copy(sleepAt = minutes?.let { now + it * 60_000L }, sleepAfterTrack = false)
    fun sleepAfterThisSong() = copy(sleepAt = null, sleepAfterTrack = true)

    private fun startWith(t: Track) = copy(tracks = listOf(t), index = 0, playing = true, manual = 0, turn = turn + 1)
}

private fun <T> List<T>.insert(i: Int, x: T) = toMutableList().apply { add(i.coerceAtMost(size), x) }
