package com.mimo.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

// Finding the YouTube video for a catalogue song, through the official YouTube Data API with the user's own key.
// Port of lib/youtube.ts (minus the IFrame loader, which is playback/YouTubeEngine.kt).

class QuotaError(message: String) : Exception(message)

/** Google API keys: "AIza" + 35 letters/digits/-/_ (39 total). */
fun looksLikeKey(k: String) = Regex("^AIza[0-9A-Za-z_-]{35}$").matches(k)

/** Pasted keys carry spaces, line breaks, quotes or invisible characters; a key buried in a longer paste is pulled out. */
fun cleanKey(raw: String): String {
    val s = raw.replace(Regex("""[^!-~]|["'`]"""), "")
    return Regex("AIza[0-9A-Za-z_-]{35}").find(s)?.value ?: s
}

/** Google's error → what to actually do about it. */
fun explain(error: JsonObject?, status: Int): String {
    fun reasons(k: String) = (error?.get(k) as? kotlinx.serialization.json.JsonArray)
        ?.mapNotNull { (it as? JsonObject)?.get("reason")?.jsonPrimitive?.contentOrNull }.orEmpty()
    val message = error?.get("message")?.jsonPrimitive?.contentOrNull
    val why = (reasons("details") + reasons("errors")).joinToString(" ") + " " + (message ?: "")
    fun has(p: String) = Regex(p, RegexOption.IGNORE_CASE).containsMatchIn(why)
    return when {
        has("REFERRER_BLOCKED|referer") ->
            "Your key is locked to websites. In Google Cloud → Credentials → your key, set Application restrictions to “None”, save, wait a minute, then Test again."
        has("ANDROID_APP_BLOCKED|IOS_APP_BLOCKED|IP_ADDRESS_BLOCKED") ->
            "Your key is restricted to other apps or IP addresses. In Google Cloud → Credentials → your key, set Application restrictions to “None”."
        has("SERVICE_BLOCKED|API_KEY_SERVICE_BLOCKED") ->
            "Your key isn't allowed to use YouTube. In Google Cloud → Credentials → your key → API restrictions, add “YouTube Data API v3”."
        has("API_KEY_INVALID|keyInvalid|badRequest") -> "That key isn't valid. Copy it again from Credentials."
        has("accessNotConfigured|SERVICE_DISABLED|not been used|disabled") ->
            "YouTube Data API v3 isn't enabled for this key's project yet. If you just enabled it, wait a minute."
        has("quotaExceeded|dailyLimitExceeded|RATE_LIMIT") -> "Today's free quota is used up. It resets at midnight Pacific time."
        else -> message ?: "YouTube API error $status"
    }
}

/** "PT4M24S" → 264 */
fun isoSeconds(iso: String?): Int {
    val m = Regex("""PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?""").find(iso ?: "") ?: return 0
    val (h, min, s) = m.destructured
    return (h.toIntOrNull() ?: 0) * 3600 + (min.toIntOrNull() ?: 0) * 60 + (s.toIntOrNull() ?: 0)
}

data class Candidate(val id: String, val title: String, val channel: String, val seconds: Int)

/** Prefer the version that sounds like the album: the label's "Topic" audio with a matching length;
 *  avoid film video songs, teasers and shorts (different intro/length → lyrics drift). */
fun pickBest(cands: List<Candidate>, albumSeconds: Double): Candidate? {
    fun has(s: String, p: String) = Regex(p, RegexOption.IGNORE_CASE).containsMatchIn(s)
    fun score(c: Candidate): Int {
        var s = 0
        val diff = Math.abs(c.seconds - albumSeconds)
        // uploads often add 1–3s of silence/logo, so "within 4s" counts as the album cut
        if (diff <= 4) s += 6 else if (diff <= 10) s += 3 else if (diff > 30) s -= 4
        if (has(c.channel, " - Topic$")) s += 4
        if (has(c.title, """\b(audio|lyrics?)\b""")) s += 2 else if (has(c.title, """\bvideo\b""")) s -= 2
        if (has(c.title, """teaser|promo|glimpse|trailer|#shorts|\breel\b|making|\bbgm\b|cover|reaction""")) s -= 6
        return s
    }
    return cands.fold(null as Candidate?) { best, c -> if (best == null || score(c) > score(best)) c else best }
}

/** "Hukum (From \"Jailer\") [feat. X]" → "Hukum": searches and lyrics match better on the bare title. */
fun cleanTitle(s: String) = s
    .replace(Regex("""\s*[(\[](from|feat\.?|ft\.?|with)\b[^)\]]*[)\]]""", RegexOption.IGNORE_CASE), "")
    .replace(Regex("""\s+-\s+(single|ep)$""", RegexOption.IGNORE_CASE), "")
    .trim()

/** track id → video id (null = none found or blocked), saved on the device so each song costs quota once. */
class VideoCache(private val file: File) {
    @Serializable private class Saved(val ids: Map<String, String?> = emptyMap())
    private val ids: MutableMap<String, String?> =
        runCatching { json.decodeFromString<Saved>(file.readText()).ids.toMutableMap() }.getOrElse { mutableMapOf() }

    @Synchronized fun has(trackId: String) = trackId in ids
    @Synchronized operator fun get(trackId: String) = ids[trackId]
    @Synchronized operator fun set(trackId: String, videoId: String?) {
        ids[trackId] = videoId
        writeAtomically(file, json.encodeToString(Saved.serializer(), Saved(ids)))
    }
}

class YouTubeSearch(private val cache: VideoCache, private val key: () -> String) {
    private val API = "https://www.googleapis.com/youtube/v3"

    private suspend fun call(url: String): JsonObject = try {
        json.parseToJsonElement(httpGet(url)).jsonObject
    } catch (e: HttpError) {
        val err = runCatching { json.parseToJsonElement(e.body).jsonObject["error"]?.jsonObject }.getOrNull()
        if (e.status == 403 || e.status == 400) throw QuotaError(explain(err, e.status))
        throw e
    }

    /** One search (100 units) + one length lookup (1 unit) per song, ever: cached on the device. */
    suspend fun findVideo(t: Track): String? {
        if (cache.has(t.id)) return cache[t.id]
        val k = "&key=${enc(cleanKey(key()))}"
        val q = "${cleanTitle(t.title)} ${t.artist.split(',', '&')[0]}"
        val found = call("$API/search?part=id&type=video&maxResults=5&videoEmbeddable=true&videoCategoryId=10&q=${enc(q)}$k")
        val ids = found["items"]?.jsonArray.orEmpty().mapNotNull { it.jsonObject["id"]?.jsonObject?.get("videoId")?.jsonPrimitive?.contentOrNull }
        var id = ids.firstOrNull()
        if (ids.size > 1) {
            val info = call("$API/videos?part=snippet,contentDetails&id=${ids.joinToString(",")}$k")
            val cands = info["items"]?.jsonArray.orEmpty().map { v ->
                val o = v.jsonObject
                val sn = o["snippet"]?.jsonObject
                Candidate(
                    id = o["id"]!!.jsonPrimitive.content,
                    title = sn?.get("title")?.jsonPrimitive?.contentOrNull ?: "",
                    channel = sn?.get("channelTitle")?.jsonPrimitive?.contentOrNull ?: "",
                    seconds = isoSeconds(o["contentDetails"]?.jsonObject?.get("duration")?.jsonPrimitive?.contentOrNull),
                )
            }
            id = pickBest(cands, t.duration)?.id ?: id
        }
        cache[t.id] = id
        return id
    }

    /** The video turned out to be blocked/removed: remember there's nothing to play for this song. */
    fun forget(trackId: String) { cache[trackId] = null }

    /** One real search to prove the key works (100 of the daily 10,000 units). Returns null if fine, else the fix. */
    suspend fun testKey(k: String): String? = try {
        call("$API/search?part=snippet&type=video&maxResults=1&videoEmbeddable=true&q=Hukum%20Anirudh&key=${enc(cleanKey(k))}")
        null
    } catch (e: QuotaError) {
        e.message
    } catch (e: Exception) {
        "Couldn't reach YouTube. Check your connection."
    }
}

/** Write to a temp file and rename, so a crash mid-write never leaves a half-written (lost) save. */
fun writeAtomically(file: File, text: String) {
    val tmp = File(file.parentFile, file.name + ".tmp")
    tmp.writeText(text)
    if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
}
