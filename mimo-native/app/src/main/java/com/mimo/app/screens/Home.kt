package com.mimo.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mimo.app.data.*
import com.mimo.app.ui.*
import kotlinx.coroutines.launch
import java.util.Calendar

// Home and New (app/page.tsx, app/new/page.tsx, components/MadeForYou.tsx).

@Composable
fun ProfileButton() {
    val c = Mimo.colors
    val nav = LocalNav.current
    val name = app().library.state.collectAsState().value.name
    Box(
        Modifier.size(40.dp).clip(CircleShape).background(c.accent).border(2.dp, c.line, CircleShape).clickable { nav.go(Screen.Settings) },
        contentAlignment = Alignment.Center,
    ) {
        if (name.isNotEmpty()) Text(name.take(1).uppercase(), style = MimoType.display.copy(fontSize = 20.sp), color = c.paper)
        else Icon("user", tint = c.paper, size = 20.dp)
    }
}

private fun greeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
    in 5..11 -> "Good morning"; in 12..16 -> "Good afternoon"; else -> "Good evening"
}

@Composable
fun HomeScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val c = Mimo.colors
    val s = lib.settings
    val songs = rememberLoad("home-songs") { app.catalog.topSongs(null, 24) }
    val albums = rememberLoad("home-albums") { app.catalog.topAlbums(null, 12) }
    // your top 2 artists from real plays (30s+), for "Because you like"
    val topArtists = remember(lib.playLog) {
        replay(lib.playLog, lib.playMeta, 0).artists.take(2).mapNotNull { a ->
            lib.playMeta.values.firstOrNull { mainArtist(it.artist) == a.name && it.artistId.isNotEmpty() }?.let { a.name to it.artistId }
        }
    }
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        var n = 0 // section numbers, counted while the list is built (not when items scroll in)
        item {
            PageHeader("Music that", hl = "moves", eyebrow = greeting() + if (lib.name.isNotEmpty()) ", ${lib.name}" else "",
                note = "your daily mix, straight from the chart ↓", trailing = { ProfileButton() })
        }
        if (!looksLikeKey(cleanKey(lib.ytKey))) item { KeyPrompt() }

        if (s.homeMadeForYou) madeForYou(lib) { ++n }

        if (s.homeRecent && lib.history.isNotEmpty()) {
            section(++n, "Your rotation", "Recently Played") { nav.go(Screen.Recent) }
            songGrid(lib.history.take(12))
        }
        if (s.homeMadeForYou) topArtists.forEach { (name, id) ->
            val k = ++n
            item(key = "because:$id") { BecauseYouLike(k, id, name) }
        }
        section(++n, "This week", "Top Albums") { nav.go(Screen.New) }
        when {
            albums.data != null -> albumShelf(albums.data)
            albums.error -> item { ErrorNote(albums.retry) }
            else -> item { Loading() }
        }
        if (s.homeFeatured) {
            section(++n, "Full catalogs", "Featured Artists")
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    items(FEATURED) { a -> FeaturedCard(a, accent = FEATURED.indexOf(a) % 2 == 0) }
                }
            }
        }
        if (s.homeMoods) {
            section(++n, "Background music", "Study & Sleep")
            items(Mood.entries) { MoodCard(it) }
        }
        if (s.homeCharts) {
            section(++n, "The chart", "Top Songs") { nav.go(Screen.GenrePage(0, "Top Songs")) }
            when {
                songs.data != null -> songGrid(songs.data)
                songs.error -> item { ErrorNote(songs.retry) }
                else -> item { Loading() }
            }
        }
        if (s.homeGenres) listOf(1262 to "Indian Hits", 14 to "Pop Mix", 18 to "Hip-Hop Mix", 7 to "Electronic Mix").forEach { (g, title) ->
            val k = ++n
            item(key = "genre:$g") { GenreShelf(k, g, title) }
        }
    }
}

@Composable
private fun KeyPrompt() {
    val c = Mimo.colors
    val nav = LocalNav.current
    Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp).fillMaxWidth().brut(c).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("ONE STEP LEFT", style = MimoType.eyebrow, color = c.accent)
        Text("Add your YouTube API key to play full songs. It's the same key as in the old Mimo app.", style = MimoType.body, color = c.ink)
        Pill("Add key", { nav.go(Screen.Settings) }, accent = true)
    }
}

/** "Made for You": On Repeat, Daily Mixes per top artist, Rediscover, Liked Mix. Songs load on tap. */
private fun androidx.compose.foundation.lazy.LazyListScope.madeForYou(lib: LibraryState, nextN: () -> Int) {
    data class Mix(val key: String, val title: String, val sub: String, val arts: List<String>, val load: suspend (App) -> List<Track>)
    val mixes = ArrayList<Mix>()
    val today = dayOf()
    val recent = replay(lib.playLog, lib.playMeta, today - 29).songs
    val recentIds = recent.mapTo(HashSet()) { it.track.id }
    if (recent.size >= 3) recent.take(30).map { it.track }.let { ts -> mixes += Mix("on-repeat", "On Repeat", "Your most played this month", ts.map { it.art }) { ts } }
    val known = lib.history + lib.liked + lib.songs
    lib.plays.entries.sortedByDescending { it.value }.map { it.key }
        .mapNotNull { name -> known.filter { mainArtist(it.artist) == name }.takeIf { l -> l.any { it.artistId.isNotEmpty() } }?.let { name to it } }
        .take(3).forEachIndexed { i, (name, ts) ->
            val id = ts.first { it.artistId.isNotEmpty() }.artistId
            mixes += Mix("mix:$id", "Daily Mix ${i + 1}", "$name and more", ts.map { it.art }.distinct()) { app ->
                val yours = (lib.liked + lib.songs).filter { mainArtist(it.artist) == name }
                (yours + app.catalog.getArtist(id).songs).distinctBy { it.id }.take(30)
            }
        }
    val older = replay(lib.playLog.filter { it.day < today - 29 }, lib.playMeta, 0).songs.filter { it.n >= 2 && it.track.id !in recentIds }
    if (older.size >= 3) older.take(30).map { it.track }.let { ts -> mixes += Mix("rediscover", "Rediscover", "Old favourites you haven't played lately", ts.map { it.art }) { ts } }
    if (lib.liked.size >= 5) mixes += Mix("liked", "Liked Mix", "${lib.liked.size} songs you love", lib.liked.map { it.art }) { lib.liked }
    if (mixes.isEmpty()) return

    section(nextN(), "Made for you", "Your Mixes")
    item {
        val app = app()
        val p = LocalPlayer.current
        val toast = LocalToast.current
        val scope = rememberCoroutineScope()
        val c = Mimo.colors
        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            items(mixes, key = { it.key }) { m ->
                Column(Modifier.width(160.dp).clickable {
                    scope.launch {
                        val ts = runCatching { m.load(app) }.getOrNull()
                        if (ts == null) toast("Couldn't load this mix. Check your connection.")
                        else if (ts.isEmpty()) toast("Nothing to play in this mix yet")
                        else p.playList(ts, -1, shuffle = true) // mixes start shuffled
                    }
                }) {
                    Box(Modifier.brut(c).padding(6.dp)) { Mosaic(m.arts) }
                    Text(m.title, style = MimoType.label, color = c.ink, modifier = Modifier.padding(top = 10.dp))
                    Text(m.sub, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

/** Up to 4 covers in a 2x2 grid (one cover fills the square). */
@Composable
fun Mosaic(arts: List<String>, modifier: Modifier = Modifier) {
    val four = arts.distinct().take(4)
    Box(modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(10.dp))) {
        if (four.size < 4) Cover(four.firstOrNull(), Modifier.fillMaxSize(), px = 400, radius = 0.dp)
        else Column {
            for (r in 0..1) Row(Modifier.weight(1f)) { for (k in 0..1) Cover(four[r * 2 + k], Modifier.weight(1f).fillMaxHeight(), px = 200, radius = 0.dp) }
        }
    }
}

@Composable
private fun BecauseYouLike(n: Int, id: String, name: String) {
    val app = app()
    val nav = LocalNav.current
    val data = rememberLoad("artist:$id") { app.catalog.getArtist(id) }.data ?: return
    if (data.songs.isEmpty()) return
    Column {
        SectionTitle(n, "For you", "Because you like $name") { nav.go(Screen.ArtistPage(id, name)) }
        SongGrid(data.songs.take(12))
    }
}

@Composable
private fun GenreShelf(n: Int, genre: Int, title: String) {
    val app = app()
    val nav = LocalNav.current
    val data = rememberLoad("genre-albums:$genre") { app.catalog.topAlbums(genre, 12) }.data ?: return
    if (data.isEmpty()) return
    Column {
        SectionTitle(n, "Genre", title) { nav.go(Screen.GenrePage(genre, title)) }
        AlbumShelf(data)
    }
}

@Composable
private fun FeaturedCard(a: Artist, accent: Boolean) {
    val c = Mimo.colors
    val nav = LocalNav.current
    val bg = if (accent) c.accent else c.card
    val fg = if (accent) c.paper else c.ink
    Row(
        Modifier.width(280.dp).brut(c.copy(card = bg), radius = 16.dp).clickable { nav.go(Screen.ArtistPage(a.id, a.name)) }.padding(14.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        ArtistAvatar(a.name, 60.dp, bg = if (accent) c.paper else c.accent, fg = if (accent) c.ink else c.paper)
        Column(Modifier.weight(1f)) {
            Text(a.name.uppercase(), style = MimoType.display.copy(fontSize = 22.sp, lineHeight = 22.sp), color = fg, maxLines = 2)
            Text("${a.genre} · all songs".uppercase(), style = MimoType.label.copy(fontSize = 12.sp), color = fg.copy(alpha = 0.75f))
        }
    }
}

/** Artist photo from Wikipedia when it's clearly them, else a monogram. */
@Composable
fun ArtistAvatar(name: String, size: androidx.compose.ui.unit.Dp, bg: androidx.compose.ui.graphics.Color = Mimo.colors.accent, fg: androidx.compose.ui.graphics.Color = Mimo.colors.paper) {
    val app = app()
    val photo = rememberLoad("photo:$name") { app.extras.artistPhoto(name) }.data
    Box(Modifier.size(size).clip(CircleShape).background(bg).border(2.4.dp, Mimo.colors.line, CircleShape), contentAlignment = Alignment.Center) {
        if (photo != null) Cover(photo, Modifier.fillMaxSize(), radius = 0.dp)
        else Text(name.take(1).uppercase(), style = MimoType.display.copy(fontSize = (size.value * 0.5f).sp), color = fg)
    }
}

@Composable
fun MoodCard(m: Mood) {
    val c = Mimo.colors
    val nav = LocalNav.current
    Row(
        Modifier.padding(horizontal = 20.dp, vertical = 8.dp).fillMaxWidth().brut(c, radius = 16.dp).clickable { nav.go(Screen.MoodPage(m)) }.padding(12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        MoodCover(m, Modifier.size(84.dp))
        Column(Modifier.weight(1f)) {
            Text(m.eyebrow.uppercase(), style = MimoType.eyebrow, color = c.accent)
            Headline(m.title, m.hl, 26.sp)
            Text(m.blurb, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Drawn cover: a big icon on the accent (study) or ink (sleep). */
@Composable
fun MoodCover(m: Mood, modifier: Modifier = Modifier) {
    val c = Mimo.colors
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(if (m == Mood.STUDY) c.accent else c.ink), contentAlignment = Alignment.Center) {
        Icon(if (m == Mood.STUDY) "note" else "moon", tint = c.paper, size = 40.dp, modifier = Modifier.graphicsLayer { rotationZ = -8f })
    }
}

@Composable
fun NewScreen() {
    val app = app()
    val albums = rememberLoad("new-albums") { app.catalog.topAlbums(null, 50) }
    val songs = rememberLoad("home-songs") { app.catalog.topSongs(null, 24) }
    val nav = LocalNav.current
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { PageHeader("New", hl = "Music", eyebrow = "Fresh this week", note = "what everyone's playing →", trailing = { ProfileButton() }) }
        section(1, "Hot right now", "Best New Songs") { nav.go(Screen.GenrePage(0, "Top Songs")) }
        when {
            songs.data != null -> songGrid(songs.data)
            songs.error -> item { ErrorNote(songs.retry) }
            else -> item { Loading() }
        }
        section(2, "New this week", "Top Albums")
        when {
            albums.data != null -> items(albums.data.chunked(2)) { pair ->
                Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    pair.forEach { a -> Box(Modifier.weight(1f)) { AlbumCard(a, width = 400.dp) } }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            albums.error -> item { ErrorNote(albums.retry) }
            else -> item { Loading() }
        }
        section(3, "Browse", "Genres")
        item { GenreTiles() }
    }
}

@Composable
fun GenreTiles() {
    val c = Mimo.colors
    val nav = LocalNav.current
    Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        GENRES.chunked(2).forEachIndexed { r, pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEachIndexed { k, g ->
                    val accent = (r + k) % 2 == 0
                    Box(
                        Modifier.weight(1f).height(72.dp).brut(c.copy(card = if (accent) c.accent else c.card)).clickable { nav.go(Screen.GenrePage(g.id, g.name)) }.padding(14.dp),
                        contentAlignment = Alignment.BottomStart,
                    ) { Text(g.name.uppercase(), style = MimoType.display.copy(fontSize = 22.sp), color = if (accent) c.paper else c.ink) }
                }
            }
        }
    }
}
