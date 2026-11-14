package com.mimo.app.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.io.File
import java.util.Calendar
import java.util.UUID

// Your library: likes, saved songs/albums, playlists, history, stats, settings. Port of lib/library.ts.
// Pure state + actions (LibraryState) and a tiny store that saves it to one JSON file (LibraryStore).

@Serializable
data class Settings(
    val theme: String = "editorial", // "editorial" | "dark"
    val themeSystem: Boolean = false, // follow the phone's light / dark setting
    val country: String = "in",
    val accent: String = "#c8603a",
    val explicit: Boolean = true,
    val reduceMotion: Boolean = false,
    val autoplay: Boolean = true, // keep playing similar songs when the queue ends
    val dataSaver: Boolean = true, // small YouTube player → lowest stream quality
    val syncedLyrics: Boolean = true,
    val blurLyrics: Boolean = true,
    val reduceBlur: Boolean = false,
    val swipePlayNext: Boolean = false,
    val noRepeatAutoplay: Boolean = false,
    val hideStatusBar: Boolean = false,
    val queueHistory: Boolean = true,
    val homeFeatured: Boolean = true,
    val homeMadeForYou: Boolean = true,
    val homeMoods: Boolean = true,
    val homeRecent: Boolean = true,
    val homeCharts: Boolean = true,
    val homeGenres: Boolean = true,
)

@Serializable
data class Playlist(
    val id: String,
    val name: String,
    val tracks: List<Track> = emptyList(),
    val created: Long,
    val desc: String? = null,
    val cover: String? = null, // small JPEG data URL
)

@Serializable
data class MonthStats(val seconds: Double = 0.0, val artists: Map<String, Double> = emptyMap())

/** Something you opened from Search, shown under the search box next time (newest first). */
@Serializable
sealed class Recent {
    @Serializable @SerialName("song") data class Song(val track: Track) : Recent()
    @Serializable @SerialName("artist") data class ArtistRef(val id: String, val name: String) : Recent()
    @Serializable @SerialName("album") data class AlbumRef(val album: Album) : Recent()
    @Serializable @SerialName("query") data class Query(val q: String) : Recent()

    val key: String get() = when (this) {
        is Song -> "s:${track.id}"
        is ArtistRef -> "ar:$id"
        is AlbumRef -> "al:${album.id}"
        is Query -> "q:${q.lowercase()}"
    }
}

/** Newest first; opening it again moves it to the top; max 20. */
fun pushRecent(list: List<Recent>, r: Recent) = (listOf(r) + list.filter { it.key != r.key }).take(20)

/** Local calendar month, e.g. "2026-11". A new key each month = automatic monthly reset. */
fun monthKey(c: Calendar = Calendar.getInstance()) = "%d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1)

@Serializable
data class LibraryState(
    val name: String = "",
    val liked: List<Track> = emptyList(),
    val songs: List<Track> = emptyList(), // "Add to Library"; loving a song also adds it
    val albums: List<Album> = emptyList(),
    val history: List<Track> = emptyList(), // newest first
    val recentSearches: List<Recent> = emptyList(),
    val playlists: List<Playlist> = emptyList(),
    val plays: Map<String, Int> = emptyMap(), // main artist → play count
    val listening: Map<String, MonthStats> = emptyMap(), // "2026-11" → seconds, per artist too
    val settings: Settings = Settings(),
    val ytKey: String = "", // never exported in a backup
    val pinned: List<String> = emptyList(), // "playlist:<id>", "album:<id>", "artist:<id>"
    val hiddenArtists: List<String> = emptyList(),
    val playLog: List<Play> = emptyList(), // Replay: every counted play, oldest first, last 4000
    val playMeta: Map<String, Track> = emptyMap(),
    val taste: Taste = Taste(),
) {
    fun isLiked(id: String) = liked.any { it.id == id }

    fun toggleLike(t: Track) =
        if (isLiked(t.id)) copy(liked = liked.filter { it.id != t.id })
        // loving a song puts it in your Library too (unlove leaves it there, like Apple Music)
        else copy(liked = listOf(t) + liked, songs = if (songs.any { it.id == t.id }) songs else songs + t)

    fun toggleSong(t: Track) = copy(
        songs = if (songs.any { it.id == t.id }) songs.filter { it.id != t.id } else songs + t,
        hiddenArtists = hiddenArtists - t.artistId, // saving a song by them brings them back
    )

    fun toggleAlbum(a: Album, now: Long = System.currentTimeMillis()) = copy(
        albums = if (albums.any { it.id == a.id }) albums.filter { it.id != a.id } else listOf(a.copy(added = now)) + albums,
        pinned = pinned - "album:${a.id}",
    )

    fun logPlay(t: Track, seconds: Double = 0.0, day: Int = dayOf()): LibraryState {
        val log = (playLog + Play(t.id, day, Math.round(seconds).toInt())).takeLast(4000)
        val kept = log.mapTo(HashSet()) { it.id }
        val a = mainArtist(t.artist)
        return copy(
            playLog = log,
            playMeta = (playMeta + (t.id to t)).filterKeys { it in kept },
            history = (listOf(t) + history.filter { it.id != t.id }).take(100),
            plays = plays + (a to (plays[a] ?: 0) + 1),
        )
    }

    /** Keep adding listening time to the play it belongs to (the last entry for that song). */
    fun addPlaySeconds(id: String, sec: Double): LibraryState {
        val at = playLog.indexOfLast { it.id == id }
        if (at < 0 || sec <= 0) return this
        return copy(playLog = playLog.toMutableList().also { it[at] = it[at].copy(sec = it[at].sec + Math.round(sec).toInt()) })
    }

    fun addListening(sec: Double, artist: String, month: String = monthKey()): LibraryState {
        val m = listening[month] ?: MonthStats()
        return copy(listening = listening + (month to MonthStats(m.seconds + sec, m.artists + (artist to (m.artists[artist] ?: 0.0) + sec))))
    }

    fun learnTaste(t: Track, skipped: Boolean) = copy(taste = taste.learn(t, skipped))

    fun clearHistory() = copy(history = emptyList(), plays = emptyMap(), playLog = emptyList(), playMeta = emptyMap(), taste = Taste())

    fun createPlaylist(name: String, first: Track? = null, id: String = UUID.randomUUID().toString(), now: Long = System.currentTimeMillis()) =
        copy(playlists = playlists + Playlist(id, name, listOfNotNull(first), now))

    private fun edit(id: String, fn: (Playlist) -> Playlist) = copy(playlists = playlists.map { if (it.id == id) fn(it) else it })
    fun addToPlaylist(id: String, t: Track) = edit(id) { it.copy(tracks = it.tracks + t) }
    fun removeFromPlaylist(id: String, i: Int) = edit(id) { p -> p.copy(tracks = p.tracks.filterIndexed { j, _ -> j != i }) }
    fun renamePlaylist(id: String, name: String, desc: String?) = edit(id) { it.copy(name = name, desc = desc) }
    fun setPlaylistCover(id: String, cover: String?) = edit(id) { it.copy(cover = cover) }
    fun deletePlaylist(id: String) = copy(playlists = playlists.filter { it.id != id }, pinned = pinned - "playlist:$id")

    fun togglePin(key: String) = copy(pinned = if (key in pinned) pinned - key else listOf(key) + pinned)
    fun hideArtist(id: String) = copy(hiddenArtists = hiddenArtists + id, pinned = pinned - "artist:$id")

    fun addRecent(r: Recent) = copy(recentSearches = pushRecent(recentSearches, r))
    fun removeRecent(key: String) = copy(recentSearches = recentSearches.filter { it.key != key })
}

/** One counted play (30s+): the song, the local day number, seconds listened. */
@Serializable
data class Play(val id: String, val day: Int, val sec: Int = 0)

/** The library in memory, saved to filesDir/library.json on every change. One per process. */
class LibraryStore private constructor(private val file: File) {
    private val _state = MutableStateFlow(load())
    val state: StateFlow<LibraryState> = _state.asStateFlow()
    val value: LibraryState get() = _state.value

    private fun load(): LibraryState = runCatching { json.decodeFromString<LibraryState>(file.readText()) }.getOrElse {
        // keep an unreadable save aside instead of overwriting it with an empty library
        if (file.exists()) file.copyTo(File(file.parentFile, "library.broken.json"), overwrite = true)
        LibraryState()
    }

    @Synchronized
    fun update(fn: (LibraryState) -> LibraryState) {
        val next = fn(_state.value)
        if (next == _state.value) return
        _state.value = next
        writeAtomically(file, json.encodeToString(LibraryState.serializer(), next))
    }

    companion object {
        @Volatile private var instance: LibraryStore? = null
        fun get(context: Context) = instance ?: synchronized(this) {
            instance ?: LibraryStore(File(context.applicationContext.filesDir, "library.json")).also { instance = it }
        }
    }
}
