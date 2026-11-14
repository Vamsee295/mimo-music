package com.mimo.app.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// Same field names as lib/store.ts and lib/api.ts, so backups move between the web app and this one.

@Serializable
data class Track(
    val id: String,
    val title: String,
    val artist: String,
    val artistId: String = "",
    val album: String = "",
    val albumId: String = "",
    val art: String = "",
    val src: String = "", // iTunes 30s preview; only used to tell playable catalogue songs apart
    val duration: Double = 30.0, // seconds
    val explicit: Boolean = false,
    val n: Int? = null, // track number on its album
    val genre: String? = null, // Apple tags Indian songs by language: "Tamil", "Telugu", …
    val year: String? = null,
)

@Serializable
data class Album(
    val id: String,
    val title: String,
    val artist: String,
    val artistId: String = "",
    val art: String = "",
    val year: String = "",
    val genre: String = "",
    val count: Int = 0,
    val explicit: Boolean = false,
    val copyright: String = "",
    val added: Long? = null, // when you saved it (Library "Recents" sort)
)

@Serializable
data class Artist(val id: String, val name: String, val genre: String = "")

/** Main artist only: "Anirudh & Arivu" → "Anirudh" (stats, taste, replay). */
fun mainArtist(a: String) = a.split(',', '&')[0].trim()

val json = Json {
    ignoreUnknownKeys = true // newer/older saves and API replies carry fields we don't model
    encodeDefaults = true // backups must carry every field, as the web app writes them
    explicitNulls = false
    coerceInputValues = true
    classDiscriminator = "kind" // Recent: {"kind":"query","q":…}, same shape as lib/library.ts
}
