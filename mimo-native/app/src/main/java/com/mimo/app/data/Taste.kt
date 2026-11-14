package com.mimo.app.data

import kotlinx.serialization.Serializable
import java.util.TimeZone

// Smarter Autoplay (lib/taste.ts) and Replay (lib/replay.ts).

@Serializable
data class Score(val skip: Int = 0, val done: Int = 0)

/** What you skip (moved on within 15s) and listen through (30s+), per song and per main artist. */
@Serializable
data class Taste(val songs: Map<String, Score> = emptyMap(), val artists: Map<String, Score> = emptyMap()) {

    /** Record one skip or listen. Keeps the last 600 songs / artists touched (insertion order = recency). */
    fun learn(t: Track, skipped: Boolean): Taste {
        fun bump(m: Map<String, Score>, k: String): Map<String, Score> {
            val old = m[k] ?: Score()
            val next = if (skipped) old.copy(skip = old.skip + 1) else old.copy(done = old.done + 1)
            val rest = m.entries.filter { it.key != k }.takeLast(KEEP - 1)
            return LinkedHashMap<String, Score>().apply { rest.forEach { put(it.key, it.value) }; put(k, next) }
        }
        return Taste(bump(songs, t.id), bump(artists, mainArtist(t.artist)))
    }

    /** Autoplay's picks, best first. Songs skipped twice and never finished are dropped; artists you mostly
     *  skip sink, artists you listen through rise. Ties keep the original order (sortedBy is stable). */
    fun rank(picks: List<Track>): List<Track> {
        fun score(t: Track): Double {
            var v = 0.0
            artists[mainArtist(t.artist)]?.let { a -> v += (a.done - a.skip * 1.5) / (a.done + a.skip + 2) }
            songs[t.id]?.let { s -> v += (s.done - s.skip) * 0.3 }
            return v
        }
        return picks.filter { t -> songs[t.id].let { s -> !(s != null && s.skip >= 2 && s.done == 0) } }
            .sortedByDescending(::score)
    }

    private companion object { const val KEEP = 600 }
}

/** Days since 1970 in local time, so "this week" follows your clock, not UTC. */
fun dayOf(ms: Long = System.currentTimeMillis()) = Math.floorDiv(ms + TimeZone.getDefault().getOffset(ms), 86_400_000L).toInt()

enum class Range(val label: String, val days: Int?) { WEEK("Weekly", 7), MONTH("Monthly", 30), YEAR("Yearly", 365), ALL("Lifetime", null) }

data class TopSong(val track: Track, val n: Int, val minutes: Int)
data class TopArtist(val name: String, val n: Int, val minutes: Int)
data class Replay(val plays: Int, val minutes: Int, val songs: List<TopSong>, val artists: List<TopArtist>)

/** Plays on or after `sinceDay`, most played first; ties go to the more recent. */
fun replay(log: List<Play>, meta: Map<String, Track>, sinceDay: Int): Replay {
    val songs = LinkedHashMap<String, Int>(); val songSec = HashMap<String, Int>()
    val artists = LinkedHashMap<String, Int>(); val artistSec = HashMap<String, Int>()
    var plays = 0; var seconds = 0
    for (p in log) {
        val t = meta[p.id] ?: continue
        if (p.day < sinceDay) continue
        plays++; seconds += p.sec
        songs.merge(p.id, 1, Int::plus); songSec.merge(p.id, p.sec, Int::plus)
        val a = mainArtist(t.artist)
        artists.merge(a, 1, Int::plus); artistSec.merge(a, p.sec, Int::plus)
    }
    // first-seen order + oldest-first log → reverse before the stable sort, so recent wins ties
    fun top(m: Map<String, Int>) = m.entries.reversed().sortedByDescending { it.value }
    fun min(s: Int?) = Math.round((s ?: 0) / 60.0).toInt()
    return Replay(
        plays, Math.round(seconds / 60.0).toInt(),
        top(songs).map { TopSong(meta.getValue(it.key), it.value, min(songSec[it.key])) },
        top(artists).map { TopArtist(it.key, it.value, min(artistSec[it.key])) },
    )
}
