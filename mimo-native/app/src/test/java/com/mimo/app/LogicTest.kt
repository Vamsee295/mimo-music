package com.mimo.app

import com.mimo.app.data.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

// The lib/*.check.ts files from the web app, same cases, as JUnit.

private fun t(id: String, title: String = id, artist: String = "A", duration: Double = 200.0) =
    Track(id = id, title = title, artist = artist, artistId = artist, duration = duration)

class QueueTest {
    @Test fun queueOrderAndManualBlock() {
        var p = Queue().playList(listOf(t("a"), t("b"), t("c")), 1)
        fun ids() = p.tracks.joinToString("") { it.id }
        assertEquals("b", p.current!!.id)
        p = p.playNext(t("x")); assertEquals("abxc", ids())
        p = p.addToQueue(t("y")); assertEquals("abxyc", ids())
        p = p.addToQueue(t("z")); assertEquals("abxyzc", ids())
        p = p.playNext(t("w")); assertEquals("abwxyzc", ids())
        assertEquals(4, p.manual)

        val turn = p.turn
        p = p.next(auto = true)
        assertEquals("w", p.current!!.id); assertEquals(3, p.manual); assertEquals(turn + 1, p.turn)

        p = p.move(6, 0); assertEquals("cabwxyz", ids()); assertEquals("w", p.current!!.id)
        p = p.removeAt(0); assertEquals("w", p.current!!.id)
        assertEquals("moving/removing never restarts the current song", turn + 1, p.turn)

        p = p.appendMany(listOf(t("r1"), t("r2")))
        p = p.addToQueue(t("q")); assertEquals("abwxyzqr1r2", ids())
        p = p.move(7, 3); assertEquals("abwr1xyzqr2", ids()); assertEquals(5, p.manual)
        p = p.removeAt(3); assertEquals(4, p.manual)
        p = p.removeAt(p.tracks.size - 1).removeAt(p.tracks.size - 2)
        assertEquals("abwxyz", ids())
    }

    @Test fun duplicatesTrackedByPosition() {
        var p = Queue().playList(listOf(t("a"), t("b")), 0)
        p = p.addToQueue(t("d")).addToQueue(t("d")).jumpTo(2).move(0, 3)
        assertEquals(1, p.index)
    }

    @Test fun endRepeatShuffleSleep() {
        var p = Queue().playList(listOf(t("a"), t("b"), t("w")), 2)
        p = p.next(auto = true); assertFalse("end with repeat off stops", p.playing)
        p = p.cycleRepeat().next(auto = true); assertEquals(0, p.index)
        p = p.toggleShuffle(Random(1)); assertEquals("a", p.tracks[0].id)
        p = p.clearUpcoming(); assertEquals(1, p.tracks.size)

        p = Queue().playList(listOf(t("a"), t("b"), t("c")), -1, shuffle = true)
        assertTrue(p.shuffle); assertEquals(3, p.tracks.size)
        p = p.playList(listOf(t("a"), t("b"), t("c")), -1, shuffle = false)
        assertEquals("abc", p.tracks.joinToString("") { it.id }); assertEquals(0, p.index)

        p = Queue().playList(listOf(t("a"), t("b")), 0).sleepAfterThisSong().next(auto = true)
        assertFalse(p.playing); assertEquals(0, p.index); assertFalse(p.sleepAfterTrack)
        p = p.setSleep(30, now = 1000); assertEquals(1000 + 30 * 60_000L, p.sleepAt)
        assertNull(p.setSleep(null).sleepAt)
    }
}

class YouTubeTest {
    @Test fun isoAndPick() {
        assertEquals(264, isoSeconds("PT4M24S")); assertEquals(3723, isoSeconds("PT1H2M3S")); assertEquals(45, isoSeconds("PT45S"))
        assertEquals("topic", pickBest(listOf(
            Candidate("film", "Netru Ponavai Video Song | Jailer 2", "Sun TV", 301),
            Candidate("teaser", "Netru Ponavai Promo", "Sun Pictures", 40),
            Candidate("topic", "Netru Ponavai", "Anirudh Ravichander - Topic", 264),
            Candidate("lyric", "Netru Ponavai Lyric Video", "Sony Music South", 266),
        ), 264.0)?.id)
        assertEquals("lyric", pickBest(listOf(Candidate("film", "X Full Video Song", "Label", 320), Candidate("lyric", "X Lyric Video", "Label", 265)), 264.0)?.id)
        assertEquals("lyric", pickBest(listOf(
            Candidate("film", "Maari - Don’u Don’u Don’u Video | Dhanush, Kajal | Anirudh |", "SonyMusicSouthVEVO", 188),
            Candidate("lyric", "Maari - Don’u Don’u Don’u Lyric | Dhanush, Kajal | Anirudh", "SonyMusicSouthVEVO", 199),
            Candidate("8k", "Don’u Don’u Don’u 8K/4K Video Song | Maari", "Sony Music South", 186),
            Candidate("cover", "Don’U Don’U Don’U - Dance Cover by someone", "Sony Music South", 219),
        ), 195.7)?.id)
    }

    @Test fun keyErrorsAndCleaning() {
        fun err(s: String) = json.parseToJsonElement(s) as kotlinx.serialization.json.JsonObject
        assertTrue(explain(err("""{"message":"Requests from referer x are blocked.","details":[{"reason":"API_KEY_HTTP_REFERRER_BLOCKED"}]}"""), 403).contains("Application restrictions"))
        assertTrue(explain(err("""{"message":"API key not valid.","errors":[{"reason":"badRequest"}],"details":[{"reason":"API_KEY_INVALID"}]}"""), 400).contains("isn't valid"))
        assertTrue(explain(err("""{"details":[{"reason":"API_KEY_SERVICE_BLOCKED"}]}"""), 403).contains("API restrictions"))
        assertTrue(explain(err("""{"errors":[{"reason":"quotaExceeded"}]}"""), 403).contains("quota"))

        val k = "AIza" + "B".repeat(35)
        assertEquals(k, cleanKey(" $k\n")); assertEquals(k, cleanKey("\"$k\"")); assertEquals(k, cleanKey("​$k﻿")); assertEquals(k, cleanKey("API key: $k"))
        assertTrue(looksLikeKey(k)); assertFalse(looksLikeKey(k.take(30))); assertFalse(looksLikeKey("123-abc.apps.googleusercontent.com"))
        assertEquals("Hukum", cleanTitle("Hukum (From \"Jailer\") [feat. X]"))
    }
}

class LibraryTest {
    @Test fun recents() {
        var l = listOf<Recent>()
        l = pushRecent(l, Recent.Query("sai"))
        l = pushRecent(l, Recent.ArtistRef("1", "Sai Abhyankkar"))
        l = pushRecent(l, Recent.Query("SAI"))
        assertEquals(listOf("q:sai", "ar:1"), l.map { it.key })
        repeat(30) { l = pushRecent(l, Recent.Query("s$it")) }
        assertEquals(20, l.size); assertEquals("q:s29", l[0].key)
    }

    @Test fun likesAndPlays() {
        var s = LibraryState().toggleLike(t("1"))
        assertTrue(s.isLiked("1")); assertEquals(1, s.songs.size)
        s = s.toggleLike(t("1")); assertFalse(s.isLiked("1")); assertEquals("unlove keeps it in the Library", 1, s.songs.size)
        s = s.logPlay(t("1", artist = "Anirudh & Arivu"), day = 5).addPlaySeconds("1", 61.4)
        assertEquals(Play("1", 5, 61), s.playLog.last()); assertEquals(1, s.plays["Anirudh"])
        val saved = json.encodeToString(LibraryState.serializer(), s.addRecent(Recent.Query("x")))
        assertEquals("round trip through the save file", s.addRecent(Recent.Query("x")), json.decodeFromString(LibraryState.serializer(), saved))
    }
}

class TasteReplayTest {
    @Test fun taste() {
        val a1 = t("a1", artist = "Anirudh"); val a2 = t("a2", artist = "Anirudh & Arivu")
        val b1 = t("b1", artist = "Badshah"); val b2 = t("b2", artist = "Badshah"); val c1 = t("c1", artist = "Chinmayi")
        val taste = Taste().learn(b1, true).learn(b1, true).learn(a1, false).learn(a1, false)
        assertEquals(Score(0, 2), taste.artists["Anirudh"]); assertEquals(Score(2, 0), taste.songs["b1"])
        assertEquals(listOf("a2", "c1", "b2"), taste.rank(listOf(b2, c1, b1, a2)).map { it.id })
        assertEquals(listOf("c1", "b2"), Taste().rank(listOf(c1, b2)).map { it.id })
        var big = Taste(); repeat(700) { big = big.learn(t("s$it", artist = "Artist $it"), false) }
        assertTrue(big.songs.size <= 600 && "s699" in big.songs && "s0" !in big.songs)
    }

    @Test fun replayCounts() {
        val meta = mapOf("a" to t("a", artist = "Anirudh & Someone"), "b" to t("b", artist = "Anirudh"), "c" to t("c", artist = "Sai"))
        val log = listOf(Play("a", 10, 120), Play("b", 10), Play("c", 12, 60), Play("a", 19, 180), Play("c", 20), Play("a", 20, 60), Play("gone", 20, 999))
        val all = replay(log, meta, 0)
        assertEquals(6, all.plays)
        assertEquals(listOf(Triple("a", 3, 6), Triple("c", 2, 1), Triple("b", 1, 0)), all.songs.map { Triple(it.track.id, it.n, it.minutes) })
        assertEquals(listOf(TopArtist("Anirudh", 4, 6), TopArtist("Sai", 2, 1)), all.artists)
        assertEquals(7, all.minutes)
        val week = replay(log, meta, 19)
        assertEquals(3, week.plays); assertEquals(listOf("a" to 2, "c" to 1), week.songs.map { it.track.id to it.n })
        assertEquals(listOf("c", "b"), replay(listOf(Play("b", 1), Play("c", 2)), meta, 0).songs.map { it.track.id })
        assertEquals(0, replay(emptyList(), meta, 0).plays)
    }
}

class RadioMoodTest {
    @Test fun radio() {
        assertEquals("Sai Abhyankkar", director("Sai Abhyankkar, Ritesh G Rao & Kasarla Shyam"))
        assertEquals("A.R. Rahman", director("A.R. Rahman"))
        assertEquals("veera veera", baseTitle("Veera Veera (From \"OM Chapter 1\")"))
        val seed = t("s", "Veera Veera (From \"OM\")")
        val album = listOf("al1", "al2", "al3").map { t(it) }
        val dir = listOf(t("d0", "Veera Veera (Remix)")) + listOf("d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "al1").map { t(it) }
        val chart = listOf("c1", "c2", "c3").map { t(it, artist = "B") }
        val ids = mixRadio(seed, album, dir, chart, setOf("d1"), 10) { it }.map { it.id }
        assertEquals(10, ids.size); assertEquals(listOf("al1", "al2"), ids.take(2))
        assertFalse("d1" in ids); assertFalse("d0" in ids); assertEquals(ids.size, ids.toSet().size)
        assertEquals(listOf("c1"), ids.filter { it.startsWith("c") })
        assertTrue(mixRadio(seed, emptyList(), emptyList(), emptyList(), emptySet(), 10) { it }.isEmpty())
    }

    @Test fun moods() {
        val a = listOf(t("a1", "Rain"), t("a2", "Rain (1 Hour)"), t("a3", "Storm"))
        val b = listOf(t("b1", "Piano"), t("b2", "Night"))
        assertEquals(listOf("a1", "b1", "b2", "a3"), mixMood(listOf(a, b)).map { it.id })
        assertEquals(2, mixMood(listOf(a, b), 2).size)
        assertTrue(mixMood(listOf(emptyList(), emptyList())).isEmpty())
    }
}

class TextTest {
    @Test fun lyrics() {
        fun row(d: Double, synced: Boolean, plain: Boolean = true) =
            LrcRow("x", "y", d, false, if (plain) "words" else null, if (synced) "[00:01.00]words" else null)
        assertEquals(201.0, pickLyrics(listOf(row(300.0, true), row(201.0, true)), 200.0)!!.duration, 0.0)
        assertEquals(250.0, pickLyrics(listOf(row(300.0, false), row(250.0, true)), 200.0)!!.duration, 0.0)
        assertNull(pickLyrics(listOf(row(300.0, true)), 200.0, strict = true))
        assertEquals(202.0, pickLyrics(listOf(row(202.0, false)), 200.0, strict = true)!!.duration, 0.0)
        assertNull(pickLyrics(emptyList(), 200.0))
        assertEquals(listOf(LyricLine(1.0, "a"), LyricLine(83.45, "b")), parseLrc("[01:23.45] b\n[00:01.00]a\nnot a line"))
    }

    @Test fun romanizeScripts() {
        assertEquals("ninnu", romanize("నిన్ను")); assertEquals("prema", romanize("ప్రేమ")); assertEquals("ammaa", romanize("அம்மா"))
        assertEquals("kamal", romanize("कमल")); assertEquals("dil se", romanize("दिल से")); assertEquals("kannada", romanize("ಕನ್ನಡ"))
        assertEquals("Hukum, Thalaivar!", romanize("Hukum, Thalaivar!")); assertEquals("nyaan", romanize("ഞാൻ"))
        assertTrue(hasIndic("ఓ ప్రియా") && !hasIndic("Oh baby"))
    }

    @Test fun artColor() {
        fun px(vararg c: Int) = c.map { 0xff000000.toInt() or it }.toIntArray()
        val red = vividColor(px(*IntArray(30) { 0x050505 }, *IntArray(6) { 0xc81e28 }))!!
        assertTrue("expected red, got ${Integer.toHexString(red)}", (red shr 16 and 0xff) > 150 && (red shr 8 and 0xff) < 80)
        assertEquals(0x6e6e6e, vividColor(px(0x646464, 0x787878)))
        assertNull(vividColor(intArrayOf(0)))
    }
}

class BackupTest {
    private val lib = LibraryState(
        name = "Vamsee", liked = listOf(t("1")), songs = listOf(t("1"), t("2")),
        albums = listOf(Album("9", "Album", "A", "1", year = "2024", genre = "Tamil", count = 10)),
        playlists = listOf(Playlist("p1", "Mix", listOf(t("2")), 1, desc = "late night")),
        history = listOf(t("2")), listening = mapOf("2026-11" to MonthStats(600.0, mapOf("A" to 600.0))),
        settings = Settings(theme = "dark", accent = "#2f6f6a"), ytKey = "AIzaSECRET",
    )

    @Test fun roundTripWithoutKey() {
        val file = makeBackup(lib)
        assertFalse("API key must never be exported", "AIzaSECRET" in file)
        val back = readBackup(file)
        assertEquals(2, back.songs.size); assertEquals("late night", back.playlists[0].desc); assertEquals(600.0, back.listening["2026-11"]!!.seconds, 0.0)
        val restored = LibraryState(ytKey = "mine").restore(back)
        assertEquals("dark", restored.settings.theme); assertEquals("the key on this phone stays", "mine", restored.ytKey)
    }

    @Test fun rejectsAndSanitizes() {
        for (bad in listOf("not json", """{"hello":1}""", """{"app":"other","liked":[],"playlists":[]}"""))
            assertTrue(runCatching { readBackup(bad) }.exceptionOrNull()?.message!!.contains("isn't a Mimo backup"))
        val tr = json.encodeToString(Track.serializer(), t("1"))
        val tr3 = json.encodeToString(Track.serializer(), t("3"))
        val messy = readBackup("""{"liked":[$tr,{"id":5},null],"playlists":[{"id":"p","name":"ok","created":1,"tracks":[$tr3,"bad"],"cover":"javascript:alert(1)"},{"name":"no id"}],"settings":{"theme":"dark","ytKey":"AIzaSMUGGLED","hacked":true,"explicit":"yes"},"evil":1}""")
        assertEquals(1, messy.liked.size); assertEquals(1, messy.playlists.size); assertEquals(1, messy.playlists[0].tracks.size)
        assertNull("only data:image covers are kept", messy.playlists[0].cover)
        assertEquals(setOf("theme"), messy.settings.keys); assertTrue(messy.songs.isEmpty())
    }

    @Test fun webAppBackupImports() {
        // shape written by lib/backup.ts, including settings this app doesn't have (crossfade, sidebarWidth)
        val web = """{"app":"mimo","version":1,"exported":"2026-11-01T00:00:00Z","name":"V","liked":[{"id":"7","title":"Hukum","artist":"Anirudh Ravichander","artistId":"1","album":"Jailer","albumId":"2","art":"","src":"x","duration":204.5,"explicit":false,"n":3,"genre":"Tamil","year":"2023"}],"songs":[],"albums":[],"playlists":[],"history":[],"listening":{},"settings":{"theme":"dark","crossfade":6,"sidebarWidth":240,"autoplay":false}}"""
        val r = readBackup(web)
        assertEquals("Hukum", r.liked[0].title); assertEquals(3, r.liked[0].n)
        assertEquals(setOf("theme", "autoplay"), r.settings.keys)
        assertFalse(LibraryState().restore(r).settings.autoplay)
    }
}
