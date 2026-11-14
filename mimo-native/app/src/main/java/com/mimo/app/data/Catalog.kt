package com.mimo.app.data

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.ConcurrentHashMap

// Apple catalogue through the public iTunes endpoints. Port of lib/api.ts.

/** Shown on Home. Apple artist IDs (India storefront). */
val FEATURED = listOf(
    Artist("480976476", "Anirudh Ravichander", "Tamil · Telugu"),
    Artist("1652280551", "Sai Abhyankkar", "Tamil · Telugu"),
)

data class Genre(val id: Int, val name: String)

val GENRES = listOf(
    Genre(14, "Pop"), Genre(18, "Hip-Hop"), Genre(1262, "Indian"), Genre(21, "Rock"), Genre(7, "Electronic"),
    Genre(15, "R&B"), Genre(20, "Alternative"), Genre(6, "Country"), Genre(12, "Latin"), Genre(51, "K-Pop"),
    Genre(17, "Dance"), Genre(11, "Jazz"),
)

/** Artwork URL at another size: ".../100x100bb.jpg" → ".../600x600bb.jpg" */
fun art(u: String?, size: Int = 600) = (u ?: "").replace(Regex("""\d+x\d+bb"""), "${size}x${size}bb")

@Serializable
internal data class Raw(
    val wrapperType: String? = null,
    val kind: String? = null,
    val trackId: Long? = null,
    val trackName: String? = null,
    val artistId: Long? = null,
    val artistName: String? = null,
    val collectionId: Long? = null,
    val collectionName: String? = null,
    val artworkUrl100: String? = null,
    val previewUrl: String? = null,
    val trackTimeMillis: Long? = null,
    val trackExplicitness: String? = null,
    val collectionExplicitness: String? = null,
    val trackNumber: Int? = null,
    val releaseDate: String? = null,
    val primaryGenreName: String? = null,
    val trackCount: Int? = null,
    val copyright: String? = null,
) {
    fun toTrack() = Track(
        id = trackId.toString(), title = trackName ?: "", artist = artistName ?: "", artistId = artistId?.toString() ?: "",
        album = collectionName ?: "", albumId = collectionId?.toString() ?: "", art = art(artworkUrl100), src = previewUrl ?: "",
        duration = (trackTimeMillis ?: 30_000) / 1000.0, explicit = trackExplicitness == "explicit",
        n = trackNumber, genre = primaryGenreName, year = releaseDate?.take(4),
    )
    fun toAlbum() = Album(
        id = collectionId.toString(), title = collectionName ?: "", artist = artistName ?: "", artistId = artistId?.toString() ?: "",
        art = art(artworkUrl100), year = releaseDate?.take(4) ?: "", genre = primaryGenreName ?: "", count = trackCount ?: 0,
        explicit = collectionExplicitness == "explicit", copyright = copyright ?: "",
    )
}

@Serializable internal data class Results(val results: List<Raw> = emptyList())

data class SearchResults(val songs: List<Track>, val albums: List<Album>, val artists: List<Artist>)
data class ArtistPage(val artist: Artist, val songs: List<Track>, val albums: List<Album>)

class Catalog(private val country: () -> String, private val explicit: () -> Boolean) {
    private val IT = "https://itunes.apple.com"

    // ponytail: in-memory cache for the app session; add a TTL if data goes stale in long sessions
    private val cache = ConcurrentHashMap<String, String>()

    private suspend fun get(url: String): String = cache[url] ?: httpGetRetrying(url).also { cache[url] = it }
    private suspend fun results(url: String) = json.decodeFromString<Results>(get(url)).results

    private fun songs(rs: List<Raw>) = rs.filter { it.kind == "song" }.map { it.toTrack() }
        .filter { it.src.isNotEmpty() && (explicit() || !it.explicit) }
    private fun albums(rs: List<Raw>) = rs.filter { it.wrapperType == "collection" }.map { it.toAlbum() }
        .filter { explicit() || !it.explicit }

    /** One request for songs + albums; artists come from the songs' main artists, most-matched first. */
    suspend fun search(q: String): SearchResults {
        val rs = results("$IT/search?term=${enc(q)}&country=${country()}&media=music&entity=song,album&limit=60")
        val artists = LinkedHashMap<String, Artist>()
        for (r in rs) if (r.kind == "song" && r.artistId != null) {
            artists.getOrPut(r.artistId.toString()) {
                Artist(r.artistId.toString(), (r.artistName ?: "").split(Regex("""\s*[,&]\s*"""))[0], r.primaryGenreName ?: "")
            }
        }
        return SearchResults(songs(rs).take(40), albums(rs).take(20), artists.values.take(10))
    }

    suspend fun searchSongs(q: String, limit: Int = 25) =
        songs(results("$IT/search?term=${enc(q)}&country=${country()}&media=music&entity=song&limit=$limit"))

    suspend fun getAlbum(id: String): Pair<Album, List<Track>> {
        val rs = results("$IT/lookup?id=$id&entity=song&country=${country()}")
        val head = rs.firstOrNull { it.wrapperType == "collection" } ?: throw NoSuchElementException("not found")
        return head.toAlbum() to songs(rs).sortedBy { it.n ?: 0 }
    }

    suspend fun getArtist(id: String): ArtistPage = coroutineScope {
        val s = async { results("$IT/lookup?id=$id&entity=song&limit=25&country=${country()}") }
        val a = async { results("$IT/lookup?id=$id&entity=album&limit=60&country=${country()}") }
        val head = s.await().firstOrNull { it.wrapperType == "artist" } ?: a.await().firstOrNull() ?: throw NoSuchElementException("not found")
        ArtistPage(Artist(id, head.artistName ?: "", head.primaryGenreName ?: ""), songs(s.await()), albums(a.await()).sortedByDescending { it.year })
    }

    private fun feed(kind: String, limit: Int, genre: Int?) =
        "$IT/${country()}/rss/$kind/limit=$limit${if (genre != null) "/genre=$genre" else ""}/json"

    private suspend fun entries(url: String): List<JsonObject> =
        when (val e = json.parseToJsonElement(get(url)).jsonObject["feed"]?.jsonObject?.get("entry")) {
            is JsonArray -> e.map { it.jsonObject }
            is JsonObject -> listOf(e) // a one-entry feed isn't wrapped in an array
            else -> emptyList()
        }

    private fun JsonElement?.label() = (this as? JsonObject)?.get("label")?.jsonPrimitive?.content
    private fun JsonElement?.attr(k: String) = ((this as? JsonObject)?.get("attributes") as? JsonObject)?.get(k)?.jsonPrimitive?.content

    suspend fun topSongs(genre: Int? = null, limit: Int = 50): List<Track> {
        val ids = entries(feed("topsongs", limit, genre)).mapNotNull { it["id"].attr("im:id") }
        if (ids.isEmpty()) return emptyList()
        val byId = songs(results("$IT/lookup?id=${ids.joinToString(",")}&country=${country()}")).associateBy { it.id }
        return ids.mapNotNull { byId[it] } // keep chart order
    }

    suspend fun topAlbums(genre: Int? = null, limit: Int = 25): List<Album> =
        entries(feed("topalbums", limit, genre)).map { e ->
            Album(
                id = e["id"].attr("im:id") ?: "",
                title = e["im:name"].label() ?: "",
                artist = e["im:artist"].label() ?: "",
                artistId = e["im:artist"].attr("href")?.let { Regex("""/(\d+)\?""").find(it)?.groupValues?.get(1) } ?: "",
                art = art((e["im:image"] as? JsonArray)?.lastOrNull().label()),
                year = e["im:releaseDate"].label()?.take(4) ?: "",
                genre = e["category"].attr("label") ?: "",
                count = e["im:itemCount"].label()?.toIntOrNull() ?: 0,
                copyright = e["rights"].label() ?: "",
            )
        }

    /** Every song on every album the artist appears on (Apple caps the album list at 200), newest first. */
    suspend fun getDiscography(artistId: String): List<Track> = coroutineScope {
        val ids = results("$IT/lookup?id=$artistId&entity=album&limit=200&country=${country()}")
            .filter { it.wrapperType == "collection" }.mapNotNull { it.collectionId }
        val pages = ids.chunked(50).map { ch -> async { results("$IT/lookup?id=${ch.joinToString(",")}&entity=song&country=${country()}") } }.awaitAll()
        songs(pages.flatten()).distinctBy { it.id }
            .sortedWith(compareByDescending<Track> { it.year ?: "" }.thenBy { it.albumId }.thenBy { it.n ?: 0 })
    }
}
