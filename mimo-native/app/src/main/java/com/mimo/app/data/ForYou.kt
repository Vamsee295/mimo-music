package com.mimo.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

// "For You" on Home (same rules as lib/forYou.ts): what's new and trending from the artists YOU listen to,
// instead of the whole country's chart. Rebuilt once a day.
//  1. Your artists: most played in the last 30 days → all time → artists of your liked/saved songs → Featured.
//  2. New for You: their songs released in the last 60 days, newest first, round-robin across artists.
//  3. Trending for You: their biggest hits (nothing already in New for You); the chart only fills a gap, and
//     only with songs in your languages (Apple tags Indian songs "Tamil", "Telugu", …).
//  4. New Albums: their albums from the last ~6 months, topped up from the chart in your languages.

private const val DAY = 86_400_000L

/** "2026-11-13T08:00:00Z" (or any date starting yyyy-MM-dd) → epoch ms, 0 if missing. Works on Android 7 (no java.time). */
fun releasedMs(d: String?): Long {
    if (d == null || d.length < 10) return 0
    return runCatching {
        SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(d.take(10))?.time ?: 0L
    }.getOrDefault(0L)
}

/** Artist ids, best first. */
fun pickArtists(lib: LibraryState, today: Int = dayOf(), max: Int = 6): List<String> {
    fun idOf(name: String) = lib.playMeta.values.firstOrNull { mainArtist(it.artist) == name && it.artistId.isNotEmpty() }?.artistId
        ?: (lib.liked + lib.songs).firstOrNull { mainArtist(it.artist) == name && it.artistId.isNotEmpty() }?.artistId
    val out = ArrayList<String>()
    fun add(id: String?) { if (id != null && id !in out && out.size < max) out += id }
    replay(lib.playLog, lib.playMeta, today - 29).artists.forEach { add(idOf(it.name)) }
    replay(lib.playLog, lib.playMeta, 0).artists.forEach { add(idOf(it.name)) }
    (lib.liked + lib.songs).filter { it.artistId.isNotEmpty() }.groupingBy { it.artistId }.eachCount()
        .entries.sortedByDescending { it.value }.forEach { add(it.key) }
    FEATURED.forEach { add(it.id) }
    return out
}

/** The languages/genres you actually play (most first). Empty = no history yet. */
fun pickGenres(lib: LibraryState): List<String> {
    val n = LinkedHashMap<String, Int>()
    lib.playLog.forEach { p -> lib.playMeta[p.id]?.genre?.let { n.merge(it, 1, Int::plus) } }
    (lib.liked + lib.songs).forEach { t -> t.genre?.let { n.merge(it, 1, Int::plus) } }
    return n.entries.sortedByDescending { it.value }.take(3).map { it.key }
}

private fun <T> roundRobin(lists: List<List<T>>): List<T> {
    val out = ArrayList<T>()
    var i = 0
    while (lists.any { i < it.size }) { lists.forEach { l -> l.getOrNull(i)?.let { out += it } }; i++ }
    return out
}

data class ForYouShelves(val newForYou: List<Track>, val trending: List<Track>)

/** The two song shelves from the raw catalogue lists. */
fun mixForYou(recent: List<List<Track>>, hits: List<List<Track>>, chart: List<Track>, now: Long = System.currentTimeMillis(), n: Int = 24): ForYouShelves {
    val fresh = roundRobin(recent.map { l ->
        l.filter { val r = releasedMs(it.released); r > 0 && now - r <= 60 * DAY && r <= now + DAY }.sortedByDescending { releasedMs(it.released) }
    })
    val seen = HashSet<String>()
    val titles = HashSet<String>()
    fun take(t: Track): Boolean {
        val b = baseTitle(t.title).ifEmpty { t.id }
        if (t.id in seen || b in titles) return false
        seen += t.id; titles += b
        return true
    }
    val newForYou = fresh.filter(::take).take(n)
    // seen/titles still hold New for You, so Trending never repeats those songs
    val trending = (roundRobin(hits) + chart).filter(::take).take(n)
    return ForYouShelves(newForYou, trending)
}

/** New albums from your artists (last ~6 months), newest first, then chart albums. */
fun mixAlbums(perArtist: List<List<Album>>, chart: List<Album>, now: Long = System.currentTimeMillis(), n: Int = 12): List<Album> =
    (perArtist.flatten().filter { val r = releasedMs(it.released); r > 0 && now - r <= 183 * DAY && r <= now + DAY }.sortedByDescending { releasedMs(it.released) } + chart)
        .distinctBy { it.id }.take(n)

@Serializable
data class ForYou(val day: Int, val artists: List<String>, val newForYou: List<Track>, val trending: List<Track>, val albums: List<Album>)

/** Today's For You, saved to filesDir/for-you.json; rebuilt once a day or when your top artists change. */
class ForYouStore(private val file: File, private val catalog: Catalog, private val library: LibraryStore) {

    suspend fun load(): ForYou {
        val lib = library.value
        val artists = pickArtists(lib)
        val today = dayOf()
        val saved = runCatching { json.decodeFromString<ForYou>(file.readText()) }.getOrNull()
        if (saved != null && saved.day == today && saved.artists.take(3) == artists.take(3) && (saved.trending.isNotEmpty() || saved.newForYou.isNotEmpty())) return saved

        val genres = pickGenres(lib)
        fun fits(g: String?) = genres.isEmpty() || g in genres
        val built = coroutineScope {
            val recent = artists.map { id -> async { runCatching { catalog.recentSongs(id) }.getOrDefault(emptyList()) } }
            val hits = artists.map { id -> async { runCatching { catalog.getArtist(id).songs }.getOrDefault(emptyList()) } }
            val albums = artists.map { id -> async { runCatching { catalog.recentAlbums(id) }.getOrDefault(emptyList()) } }
            val chartSongs = async { runCatching { catalog.topSongs(null, 100).filter { fits(it.genre) } }.getOrDefault(emptyList()) }
            val chartAlbums = async { runCatching { catalog.topAlbums(null, 50).filter { fits(it.genre) } }.getOrDefault(emptyList()) }
            val shelves = mixForYou(recent.awaitAll(), hits.awaitAll(), chartSongs.await())
            ForYou(today, artists, shelves.newForYou, shelves.trending, mixAlbums(albums.awaitAll(), chartAlbums.await()))
        }
        if (built.trending.isEmpty() && built.newForYou.isEmpty()) throw java.io.IOException("offline")
        runCatching { writeAtomically(file, json.encodeToString(ForYou.serializer(), built)) }
        return built
    }
}
