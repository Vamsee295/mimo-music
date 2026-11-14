package com.mimo.app.playback

import android.net.Uri
import android.os.Bundle
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import com.mimo.app.data.Track
import com.mimo.app.data.art
import com.mimo.app.data.json

// A catalogue Track travels to the playback service inside its MediaItem (the metadata extras survive
// the controller → session hop); the service finds its YouTube video when it's about to play.

private const val TRACK = "mimo.track"

fun Track.toMediaItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(artist)
            .setAlbumTitle(album)
            .setArtworkUri(Uri.parse(art(art, 600)))
            .setDurationMs((duration * 1000).toLong())
            .setIsPlayable(true)
            .setIsBrowsable(false)
            .setExtras(Bundle().apply { putString(TRACK, json.encodeToString(Track.serializer(), this@toMediaItem)) })
            .build(),
    ).build()

fun MediaItem.track(): Track? = mediaMetadata.extras?.getString(TRACK)?.let {
    runCatching { json.decodeFromString(Track.serializer(), it) }.getOrNull()
}
