package com.mimo.app.data

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import java.time.Instant

// Library backup: same file format as lib/backup.ts, so a library exported from the web/Capacitor app
// imports here (and back). There's no account, so this file is the only way to move or rescue a library.

class BackupError(message: String) : Exception(message)

data class Restored(
    val name: String,
    val liked: List<Track>,
    val songs: List<Track>,
    val albums: List<Album>,
    val playlists: List<Playlist>,
    val history: List<Track>,
    val listening: Map<String, MonthStats>,
    val settings: JsonObject, // only known keys with the right types
)

/** Everything worth keeping. The YouTube key isn't part of Settings, so it can never end up in the file. */
fun makeBackup(lib: LibraryState, now: Instant = Instant.now()): String = json.encodeToString(
    JsonObject.serializer(),
    buildJsonObject {
        put("app", "mimo")
        put("version", 1)
        put("exported", now.toString())
        put("name", lib.name)
        put("liked", json.encodeToJsonElement(lib.liked))
        put("songs", json.encodeToJsonElement(lib.songs))
        put("albums", json.encodeToJsonElement(lib.albums))
        put("playlists", json.encodeToJsonElement(lib.playlists))
        put("history", json.encodeToJsonElement(lib.history))
        put("listening", json.encodeToJsonElement(lib.listening))
        put("settings", json.encodeToJsonElement(lib.settings))
    },
)

private fun JsonElement?.str() = (this as? JsonPrimitive)?.takeIf { it.isString }?.content
private fun JsonElement?.num() = (this as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull
private fun JsonElement?.obj() = this as? JsonObject
private fun JsonElement?.arr() = (this as? JsonArray).orEmpty()

private fun isTrack(t: JsonElement) = t.obj()?.let { it["id"].str() != null && it["title"].str() != null && it["artist"].str() != null && it["duration"].num() != null } == true
private fun tracks(v: JsonElement?) = v.arr().filter(::isTrack).mapNotNull { runCatching { json.decodeFromJsonElement(Track.serializer(), it) }.getOrNull() }

/** Settings a backup may restore, with the JSON type each must have. */
private val SETTING_TYPES: Map<String, String> = Settings.serializer().descriptor.let { d ->
    (0 until d.elementsCount).associate { d.getElementName(it) to d.getElementDescriptor(it).serialName }
}

/**
 * Reads a backup file. Throws a human message if it isn't a Mimo backup. Malformed entries are dropped one
 * by one, and nothing outside the known fields gets through (a hand-edited file can't inject unexpected keys).
 */
fun readBackup(text: String): Restored {
    val raw = runCatching { json.parseToJsonElement(text) }.getOrElse { throw BackupError("That file isn't a Mimo backup (it isn't valid JSON).") }
    val o = raw.obj()
    if (o == null || (o["app"] != null && o["app"].str() != "mimo") || o["liked"] !is JsonArray || o["playlists"] !is JsonArray)
        throw BackupError("That file isn't a Mimo backup. Use the file made by “Export my library”.")

    val settings = buildJsonObject {
        o["settings"].obj()?.forEach { (k, v) ->
            val p = v as? JsonPrimitive ?: return@forEach
            val ok = when (SETTING_TYPES[k]) {
                "kotlin.String" -> p.isString
                "kotlin.Boolean" -> !p.isString && p.booleanOrNull != null
                else -> false // unknown keys (and the API key) never get in
            }
            if (ok) put(k, p)
        }
    }
    val listening = o["listening"].obj().orEmpty().mapNotNull { (month, m) ->
        val mo = m.obj() ?: return@mapNotNull null
        val sec = mo["seconds"].num()
        val artists = mo["artists"].obj()
        if (!Regex("""^\d{4}-\d{2}$""").matches(month) || sec == null || artists == null) null
        else month to MonthStats(sec, artists.mapNotNull { (a, s) -> s.num()?.let { a to it } }.toMap())
    }.toMap()
    val playlists = o["playlists"].arr().mapNotNull { p ->
        val po = p.obj() ?: return@mapNotNull null
        val id = po["id"].str(); val name = po["name"].str(); val created = po["created"].num()
        if (id == null || name == null || po["tracks"] !is JsonArray || created == null) return@mapNotNull null
        Playlist(id, name, tracks(po["tracks"]), created.toLong(), po["desc"].str(), po["cover"].str()?.takeIf { it.startsWith("data:image/") })
    }
    return Restored(
        name = o["name"].str()?.take(60) ?: "",
        liked = tracks(o["liked"]),
        songs = tracks(o["songs"]),
        albums = o["albums"].arr().filter { a -> a.obj()?.let { it["id"].str() != null && it["title"].str() != null && it["artist"].str() != null } == true }
            .mapNotNull { runCatching { json.decodeFromJsonElement(Album.serializer(), it) }.getOrNull() },
        playlists = playlists,
        history = tracks(o["history"]).take(100),
        listening = listening,
        settings = settings,
    )
}

/** Imported data replaces the library's; stats, taste and the YouTube key on this phone are kept. */
fun LibraryState.restore(r: Restored): LibraryState {
    val merged = JsonObject(json.encodeToJsonElement(settings).obj().orEmpty() + r.settings)
    return copy(
        name = r.name, liked = r.liked, songs = r.songs, albums = r.albums, playlists = r.playlists,
        history = r.history, listening = r.listening, settings = json.decodeFromJsonElement(Settings.serializer(), merged),
    )
}
