package com.mimo.app

import androidx.media3.common.Player
import com.mimo.app.playback.mediaState
import com.mimo.app.playback.skippable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class YouTubePlayerTest {
    @Test fun mapsYouTubeStates() {
        assertEquals(Player.STATE_IDLE, mediaState(1, hasItems = false, playWhenReady = true))
        assertEquals(Player.STATE_READY, mediaState(1, true, true)) // playing
        assertEquals(Player.STATE_READY, mediaState(2, true, false)) // paused
        assertEquals(Player.STATE_READY, mediaState(5, true, false)) // cued
        assertEquals(Player.STATE_ENDED, mediaState(0, true, true))
        assertEquals(Player.STATE_BUFFERING, mediaState(3, true, true))
        assertEquals(Player.STATE_BUFFERING, mediaState(-1, true, true)) // loading the next song
        assertEquals(Player.STATE_READY, mediaState(-1, true, false)) // loaded but not asked to play
    }

    @Test fun skipsBlockedVideosOnly() {
        listOf(2, 100, 101, 150).forEach { assertTrue(skippable(it)) }
        assertFalse(skippable(5)) // HTML5 player error: retrying the same song is the user's call
    }
}
