package com.mimo.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

// Now Playing extras: lyrics (LRCLIB, then lyrics.ovh) and artist bio (Wikipedia). Port of lib/extras.ts.

data class LyricSpan(val t: Double, val end: Double, val text: String)
data class LyricLine(val t: Double, val text: String, val spans: List<LyricSpan>? = null)
data class Lyrics(val synced: List<LyricLine>?, val plain: String?, val instrumental: Boolean)
data class Bio(val title: String, val extract: String, val image: String?, val url: String)

@Serializable
data class LrcRow(
    val trackName: String = "",
    val artistName: String = "",
    val duration: Double = 0.0,
    val instrumental: Boolean = false,
    val plainLyrics: String? = null,
    val syncedLyrics: String? = null,
)

private fun firstArtist(s: String) = s.split(Regex(""",|&| x | feat\.? """, RegexOption.IGNORE_CASE))[0].trim()

/** "00:01:23.45" or "01:23.45" or "83.45" -> 83.45 */
fun parseTime(s: String): Double {
    if (s.isEmpty()) return 0.0
    val parts = s.trim().split(":")
    return when (parts.size) {
        3 -> parts[0].toDoubleOrNull()?.times(3600)?.plus((parts[1].toDoubleOrNull() ?: 0.0) * 60)?.plus(parts[2].toDoubleOrNull() ?: 0.0) ?: 0.0
        2 -> parts[0].toDoubleOrNull()?.times(60)?.plus(parts[1].toDoubleOrNull() ?: 0.0) ?: 0.0
        else -> s.toDoubleOrNull() ?: 0.0
    }
}

/** Apple Music TTML parser: <p begin="..." end="..."> <span begin="..." end="...">word</span> </p> */
fun parseTtml(ttml: String): List<LyricLine> {
    val pRegex = Regex("""<p\b[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>([\s\S]*?)</p>""", RegexOption.IGNORE_CASE)
    val spanRegex = Regex("""<span\b[^>]*begin="([^"]+)"[^>]*end="([^"]+)"[^>]*>([\s\S]*?)</span>""", RegexOption.IGNORE_CASE)
    val clean = { str: String -> str.replace(Regex("<[^>]+>"), "").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"") }
    return pRegex.findAll(ttml).mapNotNull { pMatch ->
        val beginStr = pMatch.groupValues[1]
        val pBody = pMatch.groupValues[3]
        val t = parseTime(beginStr)
        val spans = spanRegex.findAll(pBody).map { sMatch ->
            val sBegin = parseTime(sMatch.groupValues[1])
            val sEnd = parseTime(sMatch.groupValues[2])
            val sText = clean(sMatch.groupValues[3])
            LyricSpan(sBegin, sEnd, sText)
        }.toList()
        val text = clean(if (spans.isNotEmpty()) spans.joinToString("") { it.text } else pBody).trim()
        if (text.isNotEmpty()) LyricLine(t, text, spans.ifEmpty { null }) else null
    }.sortedBy { it.t }.toList()
}

/** "[01:23.45] line" → LyricLine(83.45, "line"), sorted by time. */
fun parseLrc(lrc: String): List<LyricLine> = lrc.lines().mapNotNull { row ->
    Regex("""^\[(\d+):(\d+(?:\.\d+)?)](.*)$""").find(row)?.destructured?.let { (m, s, text) ->
        LyricLine(m.toInt() * 60 + s.toDouble(), text.trim())
    }
}.sortedBy { it.t }

/** The best LRCLIB row, or null. Synced lyrics whose length matches (±4s) win; with `strict`, a row of a
 *  different length is never accepted (a title-only search finds other songs too). */
fun pickLyrics(rows: List<LrcRow>, seconds: Double, strict: Boolean = false): LrcRow? {
    fun near(x: LrcRow) = Math.abs(x.duration - seconds) <= 4
    val ok = if (strict) rows.filter(::near) else rows
    return ok.firstOrNull { near(it) && it.syncedLyrics != null }
        ?: ok.firstOrNull { it.syncedLyrics != null }
        ?: ok.firstOrNull { it.plainLyrics != null || it.instrumental }
}

private fun LrcRow.toLyrics() = Lyrics(syncedLyrics?.let(::parseLrc), plainLyrics, instrumental)

class Extras {
    private val lyrics = ConcurrentHashMap<String, Lyrics?>() // only answers are cached; failures retry next time
    private val bios = ConcurrentHashMap<String, Bio?>()

    private suspend fun lrclib(path: String, params: List<Pair<String, String>>): List<LrcRow> = try {
        val q = params.joinToString("&") { (k, v) -> "$k=${enc(v)}" }
        when (val j = json.parseToJsonElement(httpGet("https://lrclib.net/api/$path?$q"))) {
            is JsonArray -> j.map { json.decodeFromJsonElement(LrcRow.serializer(), it) }
            else -> listOf(json.decodeFromJsonElement(LrcRow.serializer(), j))
        }
    } catch (e: HttpError) {
        if (e.status == 404) emptyList() else throw e
    }

    private suspend fun biniLyrics(title: String, artist: String, duration: Double): Lyrics? = try {
        val q = "track=${enc(title)}&artist=${enc(artist)}&duration=${Math.round(duration)}"
        val body = httpGet("https://lyrics-api.binimum.org/?$q", 5000)
        val j = json.parseToJsonElement(body).jsonObject
        val results = j["results"]?.jsonArray
        val hit = results?.firstOrNull()?.jsonObject
        val url = hit?.get("lyricsUrl")?.jsonPrimitive?.contentOrNull
        val hitDur = hit?.get("duration")?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
        if (url != null && (hitDur == null || Math.abs(hitDur - duration) <= 6)) {
            val ttml = httpGet(url, 5000)
            val lines = parseTtml(ttml)
            if (lines.isNotEmpty()) Lyrics(lines, null, false) else null
        } else null
    } catch (e: Exception) {
        null
    }

    /** Lyrics from BiniLyrics (word-synced Apple TTML), falling back to LRCLIB, then lyrics.ovh. Throws only when offline. */
    suspend fun getLyrics(t: Track): Lyrics? {
        if (lyrics.containsKey(t.id)) return lyrics[t.id]
        val title = cleanTitle(t.title)
        val artist = firstArtist(t.artist)

        // 1. Try BiniLyrics for Apple Music word/syllable TTML
        val bini = biniLyrics(title, artist, t.duration)
        if (bini?.synced != null) {
            lyrics[t.id] = bini
            return bini
        }

        val tries = listOf<Pair<suspend () -> List<LrcRow>, Boolean>>(
            suspend { lrclib("search", listOf("track_name" to title, "artist_name" to artist)) } to false,
            suspend { lrclib("get", listOf("track_name" to title, "artist_name" to artist, "album_name" to cleanTitle(t.album), "duration" to Math.round(t.duration).toString())) } to false,
            suspend { lrclib("search", listOf("q" to "$title $artist")) } to true,
            suspend { lrclib("search", listOf("track_name" to title)) } to true,
        )
        var fallback: LrcRow? = null
        var failed = 0
        for ((lookup, strict) in tries) {
            val rows = runCatching { lookup() }.getOrElse { failed++; emptyList() }
            val best = pickLyrics(rows, t.duration, strict)
            if (best?.syncedLyrics != null || best?.instrumental == true) return best.toLyrics().also { lyrics[t.id] = it }
            if (fallback == null) fallback = best
        }
        fallback?.let { return it.toLyrics().also { l -> lyrics[t.id] = l } }
        val plain = runCatching { lyricsOvh(artist, title) }.getOrNull()
        if (plain == null && failed == tries.size) throw java.io.IOException("lyrics unreachable")
        val result = if (!plain.isNullOrEmpty()) Lyrics(null, plain, false) else null
        lyrics[t.id] = result
        return result
    }

    /** "" = they don't have it; throws when unreachable. */
    private suspend fun lyricsOvh(artist: String, title: String): String = try {
        val j = json.parseToJsonElement(httpGet("https://api.lyrics.ovh/v1/${enc(artist)}/${enc(title)}", 8000)).jsonObject
        (j["lyrics"]?.jsonPrimitive?.contentOrNull ?: "").replace("\r\n", "\n").trim()
    } catch (e: HttpError) {
        if (e.status == 404) "" else throw e
    }

    suspend fun getBio(artist: String): Bio? {
        val name = firstArtist(artist)
        if (bios.containsKey(name)) return bios[name]
        // search first: "Anirudh" alone would hit a disambiguation page
        val s = json.parseToJsonElement(
            httpGet("https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=1&srsearch=${enc("$name musician")}"),
        ).jsonObject
        val title = s["query"]?.jsonObject?.get("search")?.jsonArray?.firstOrNull()?.jsonObject?.get("title")?.jsonPrimitive?.contentOrNull
        val bio = title?.let {
            val j = json.parseToJsonElement(httpGet("https://en.wikipedia.org/api/rest_v1/page/summary/${enc(it)}")).jsonObject
            val extract = j["extract"]?.jsonPrimitive?.contentOrNull
            if (extract.isNullOrEmpty() || j["type"]?.jsonPrimitive?.contentOrNull == "disambiguation") null
            else Bio(
                j["title"]?.jsonPrimitive?.contentOrNull ?: it, extract,
                (j["thumbnail"] as? JsonObject)?.get("source")?.jsonPrimitive?.contentOrNull,
                ((j["content_urls"] as? JsonObject)?.get("desktop") as? JsonObject)?.get("page")?.jsonPrimitive?.contentOrNull
                    ?: "https://en.wikipedia.org/wiki/$it",
            )
        }
        bios[name] = bio
        return bio
    }

    /** The artist's photo, only when their Wikipedia page is clearly about a musician (else a same-named
     *  actor or place would put the wrong face on them). null → show the monogram. */
    suspend fun artistPhoto(artist: String): String? {
        val bio = runCatching { getBio(artist) }.getOrNull() ?: return null
        val musician = Regex("""\b(singer|composer|musician|rapper|band|songwriter|vocalist|music director|playback|producer|DJ|duo|group)\b""", RegexOption.IGNORE_CASE)
        return bio.image?.takeIf { musician.containsMatchIn(bio.extract) }
    }
}
