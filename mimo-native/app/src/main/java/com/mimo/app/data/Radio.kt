package com.mimo.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

// Autoplay ("radio", lib/radio.ts) and the Study / Sleep mood libraries (lib/moods.ts).

/** "Veera Veera (From "OM Chapter 1")" → "veera veera": versions of one song share this. */
fun baseTitle(t: String) = t.lowercase().replace(Regex("""[(\[].*$"""), "").replace(Regex("""[^\p{L}\p{N} ]"""), "").trim()

/** The music director: the first credited name ("Sai Abhyankkar, Ritesh G Rao & Kasarla Shyam" → "Sai Abhyankkar"). */
fun director(artist: String) = artist.split(Regex("""\s*(?:,|&| and | x | feat\.? )\s*""", RegexOption.IGNORE_CASE))[0].trim()

/** Up to 2 more from the same soundtrack, the rest by the same director, charts only to fill a gap.
 *  Nothing already queued/played, and no second version of one song. */
fun mixRadio(
    seed: Track, sameAlbum: List<Track>, byDirector: List<Track>, chart: List<Track>, exclude: Set<String>,
    n: Int = 10, rand: (List<Track>) -> List<Track> = { it.shuffled() },
): List<Track> {
    val seen = exclude.toMutableSet()
    val titles = mutableSetOf(baseTitle(seed.title))
    val out = ArrayList<Track>()
    fun take(list: List<Track>, max: Int) {
        var k = max
        for (t in rand(list)) {
            if (out.size >= n || k <= 0) return
            val b = baseTitle(t.title)
            if (t.id in seen || b in titles) continue
            seen += t.id; titles += b; out += t; k--
        }
    }
    take(sameAlbum, 2); take(byDirector, n); take(chart, n)
    return out
}

/** Songs to play after `seed` once the queue ends. Network failures just mean fewer (or no) songs. */
suspend fun radioAfter(catalog: Catalog, seed: Track, exclude: Set<String>, n: Int = 10): List<Track> = coroutineScope {
    val name = director(seed.artist)
    val album = async { if (seed.albumId.isEmpty()) emptyList() else runCatching { catalog.getAlbum(seed.albumId).second }.getOrDefault(emptyList()) }
    val works = async { if (seed.artistId.isEmpty()) emptyList() else runCatching { catalog.getArtist(seed.artistId).songs }.getOrDefault(emptyList()) }
    val found = async {
        if (name.isEmpty()) emptyList()
        else runCatching { catalog.searchSongs(name, 50).filter { it.artist.contains(name, ignoreCase = true) } }.getOrDefault(emptyList())
    }
    val byDirector = works.await() + found.await()
    // charts only fill a gap, and only in the seed's language/genre: the India chart mixes unrelated hits
    val chart = if (byDirector.size >= n) emptyList()
    else runCatching { catalog.topSongs(null, 100).filter { seed.genre == null || it.genre == seed.genre } }.getOrDefault(emptyList())
    mixRadio(seed, album.await(), byDirector, chart, exclude, n)
}

enum class Mood(val title: String, val hl: String, val eyebrow: String, val blurb: String, val searches: List<String>, val timers: List<Int>) {
    STUDY(
        "Study", "Lofi", "Focus · lofi & chillhop",
        "Lofi beats, chillhop and Bollywood lofi flips. No lyrics in the way, just a steady groove to work to.",
        listOf("chillhop", "bollywood lofi", "lofi jazz", "lofi hip hop"), listOf(25, 50),
    ),
    SLEEP(
        "Sleep", "Sounds", "Wind down · calm & ambient",
        "Rain, ocean waves, soft piano and ambient drones. Set it to stop on its own and drift off.",
        listOf("rain sounds", "sleep piano", "ambient sleep", "ocean waves sleep"), listOf(30, 60),
    ),
}

/** One from each search in turn, skipping title clones ("Lofi Study" ×20), up to `max`. */
fun mixMood(lists: List<List<Track>>, max: Int = 60): List<Track> {
    val seen = HashSet<String>()
    val out = ArrayList<Track>()
    var i = 0
    while (out.size < max && lists.any { i < it.size }) {
        for (l in lists) {
            val t = l.getOrNull(i) ?: continue
            if (out.size >= max) break
            val k = baseTitle(t.title).ifEmpty { t.id }
            if (seen.add(k)) out += t
        }
        i++
    }
    return out
}

/** A search that fails just contributes nothing; only all of them failing is an error. */
suspend fun loadMood(catalog: Catalog, mood: Mood): List<Track> = coroutineScope {
    val lists = mood.searches.map { q -> async { runCatching { catalog.searchSongs(q, 40) }.getOrNull() } }.awaitAll()
    if (lists.all { it == null }) throw java.io.IOException("offline")
    mixMood(lists.map { it ?: emptyList() })
}
