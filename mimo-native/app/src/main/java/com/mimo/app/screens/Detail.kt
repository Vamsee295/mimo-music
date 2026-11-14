package com.mimo.app.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mimo.app.data.*
import com.mimo.app.ui.*
import kotlinx.coroutines.launch

// Album, Artist, Playlist, Genre chart, Study/Sleep, Liked, Recently Played.

/** Back arrow row at the top of a pushed page. */
@Composable
fun BackBar(trailing: @Composable RowScope.() -> Unit = {}) {
    val nav = LocalNav.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconBtn("left", "Back", { nav.back() }, size = 26.dp)
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

private fun LazyListScope.tracks(list: List<Track>, numbered: Boolean = false, onRemove: ((Int) -> Unit)? = null) =
    itemsIndexed(list, key = { i, t -> "$i:${t.id}" }) { i, t ->
        val p = LocalPlayer.current
        TrackRow(t, { p.playList(list, i) }, number = if (numbered) t.n ?: (i + 1) else null, onRemove = onRemove?.let { { it(i) } })
    }

@Composable
private fun ArtHeader(art: String?, eyebrow: String, title: String, sub: String, onSub: (() -> Unit)? = null) {
    val c = Mimo.colors
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.fillMaxWidth(0.72f).brut(c, radius = 18.dp).padding(8.dp)) { Cover(art, Modifier.fillMaxWidth().aspectRatio(1f), px = 600, radius = 12.dp) }
        Spacer(Modifier.height(18.dp))
        Text(eyebrow.uppercase(), style = MimoType.eyebrow, color = c.accent)
        Text(title.uppercase(), style = MimoType.display.copy(fontSize = 32.sp, lineHeight = 32.sp), color = c.ink, modifier = Modifier.padding(top = 4.dp))
        Text(sub, style = MimoType.label, color = c.accent, modifier = Modifier.padding(top = 4.dp).then(if (onSub != null) Modifier.clickable(onClick = onSub) else Modifier))
        Spacer(Modifier.height(16.dp))
    }
}

@Composable
fun AlbumScreen(id: String, preview: Album?) {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val load = rememberLoad("album:$id") { app.catalog.getAlbum(id) }
    val album = load.data?.first ?: preview
    val saved = lib.albums.any { it.id == id }
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item {
            BackBar {
                if (album != null) IconBtn(if (saved) "check" else "plus", if (saved) "Remove album" else "Save album", { app.library.update { it.toggleAlbum(album) } }, tint = Mimo.colors.accent)
            }
        }
        if (album != null) item {
            ArtHeader(album.art, listOf(album.genre, album.year).filter { it.isNotEmpty() }.joinToString(" · ").ifEmpty { "Album" }, album.title, album.artist) {
                if (album.artistId.isNotEmpty()) nav.go(Screen.ArtistPage(album.artistId, album.artist))
            }
        }
        when {
            load.data != null -> {
                item { PlayShuffle(load.data.second) }
                item { Spacer(Modifier.height(10.dp)) }
                tracks(load.data.second, numbered = true)
                item {
                    val ts = load.data.second
                    Text(
                        "${ts.size} songs, ${Math.round(ts.sumOf { it.duration } / 60)} minutes" + (album?.copyright?.takeIf { it.isNotEmpty() }?.let { "\n$it" } ?: ""),
                        style = MimoType.body.copy(fontSize = 12.sp), color = Mimo.colors.ink.copy(alpha = 0.5f), modifier = Modifier.padding(20.dp),
                    )
                }
            }
            load.error -> item { ErrorNote(load.retry) }
            else -> item { Loading() }
        }
    }
}

@Composable
fun ArtistScreen(id: String, name: String) {
    val app = app()
    val p = LocalPlayer.current
    val toast = LocalToast.current
    val c = Mimo.colors
    val load = rememberLoad("artist:$id") { app.catalog.getArtist(id) }
    val shownName = load.data?.artist?.name ?: name
    val bio = rememberLoad("bio:$shownName", shownName) { if (shownName.isEmpty()) null else app.extras.getBio(shownName) }.data
    var loadingAll by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                ArtistAvatar(shownName.ifEmpty { "?" }, 150.dp)
                Spacer(Modifier.height(14.dp))
                Text((load.data?.artist?.genre ?: "Artist").uppercase(), style = MimoType.eyebrow, color = c.accent)
                Text(shownName.uppercase(), style = MimoType.display.copy(fontSize = 38.sp, lineHeight = 38.sp), color = c.ink)
                Spacer(Modifier.height(14.dp))
            }
        }
        when {
            load.data != null -> {
                val page = load.data
                item {
                    Row(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Pill("Play", { p.playList(page.songs, 0, shuffle = false) }, icon = "play", enabled = page.songs.isNotEmpty())
                        // every song they're on, across all albums (one lookup per 50 albums)
                        Pill(if (loadingAll) "Loading…" else "Shuffle all", {
                            loadingAll = true
                            scope.launch {
                                val all = runCatching { app.catalog.getDiscography(id) }.getOrNull()
                                loadingAll = false
                                if (all.isNullOrEmpty()) toast("Couldn't load their songs") else { p.playList(all, -1, shuffle = true); toast("${all.size} songs, shuffled") }
                            }
                        }, filled = false, icon = "shuffle", enabled = !loadingAll)
                    }
                }
                section(1, "Most popular", "Top Songs")
                tracks(page.songs.take(10))
                if (page.albums.isNotEmpty()) {
                    section(2, "Discography", "Albums")
                    albumShelf(page.albums)
                }
                if (bio != null) {
                    section(3, "Wikipedia", "About")
                    item {
                        Text(bio.extract, style = MimoType.body, color = c.ink.copy(alpha = 0.8f), maxLines = 8, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(horizontal = 20.dp).brut(c).padding(16.dp))
                    }
                }
            }
            load.error -> item { ErrorNote(load.retry) }
            else -> item { Loading() }
        }
    }
}


@Composable
fun PlaylistScreen(id: String) {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val c = Mimo.colors
    val pl = lib.playlists.firstOrNull { it.id == id } ?: return Column { BackBar(); Loading("This playlist was deleted.") }
    var renaming by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item {
            BackBar {
                IconBtn("pin", "Pin", { app.library.update { it.togglePin("playlist:$id") } }, tint = if ("playlist:$id" in lib.pinned) c.accent else c.ink.copy(alpha = 0.5f))
                IconBtn("pencil", "Rename", { renaming = true })
                IconBtn("trash", "Delete", { confirmDelete = true })
            }
        }
        item {
            Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth(0.62f).brut(c, radius = 18.dp).padding(8.dp)) { Mosaic(pl.tracks.map { it.art }) }
                Spacer(Modifier.height(16.dp))
                Text("PLAYLIST · ${pl.tracks.size} SONGS", style = MimoType.eyebrow, color = c.accent)
                Text(pl.name.uppercase(), style = MimoType.display.copy(fontSize = 32.sp, lineHeight = 32.sp), color = c.ink)
                pl.desc?.let { Text(it, style = MimoType.note, color = c.note) }
                Spacer(Modifier.height(14.dp))
            }
        }
        item { PlayShuffle(pl.tracks) }
        item { Spacer(Modifier.height(10.dp)) }
        if (pl.tracks.isEmpty()) item { Loading("Add songs from any ⋯ menu.") }
        tracks(pl.tracks, onRemove = { i -> app.library.update { it.removeFromPlaylist(id, i) } })
    }
    if (renaming) NameDialog("Rename playlist", pl.name, { renaming = false }) { n -> app.library.update { it.renamePlaylist(id, n, pl.desc) } }
    if (confirmDelete) androidx.compose.ui.window.Dialog({ confirmDelete = false }) {
        Column(Modifier.fillMaxWidth().brut(c).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Delete “${pl.name}”? This can't be undone.", style = MimoType.body, color = c.ink)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pill("Delete", { confirmDelete = false; nav.back(); app.library.update { it.deletePlaylist(id) } }, accent = true)
                Pill("Cancel", { confirmDelete = false }, filled = false)
            }
        }
    }
}

/** A chart: genre 0 = all genres. */
@Composable
fun GenreScreen(id: Int, name: String) {
    val app = app()
    val songs = rememberLoad("genre-songs:$id") { app.catalog.topSongs(id.takeIf { it != 0 }, 50) }
    val albums = rememberLoad("genre-albums:$id") { app.catalog.topAlbums(id.takeIf { it != 0 }, 12) }
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item { PageHeader(name, eyebrow = "The chart", note = "top 50 right now ↓") }
        if (albums.data?.isNotEmpty() == true) { section(1, "Albums", "Top Albums"); albumShelf(albums.data) }
        section(2, "Songs", "Top Songs")
        when {
            songs.data != null -> { item { PlayShuffle(songs.data) }; tracks(songs.data, numbered = false) }
            songs.error -> item { ErrorNote(songs.retry) }
            else -> item { Loading() }
        }
    }
}

@Composable
fun MoodScreen(m: Mood) {
    val app = app()
    val toast = LocalToast.current
    val songs = rememberLoad("mood:${m.name}") { loadMood(app.catalog, m) }
    val c = Mimo.colors
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item {
            Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                MoodCover(m, Modifier.size(96.dp))
                Column(Modifier.weight(1f)) {
                    Text(m.eyebrow.uppercase(), style = MimoType.eyebrow, color = c.accent)
                    Headline(m.title, m.hl, 34.sp)
                }
            }
        }
        item { Text(m.blurb, style = MimoType.body, color = c.ink.copy(alpha = 0.7f), modifier = Modifier.padding(20.dp)) }
        item {
            Row(Modifier.padding(start = 20.dp, end = 20.dp, bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (m == Mood.STUDY) "FOCUS FOR" else "STOP AFTER", style = MimoType.label, color = c.ink)
                m.timers.forEach { min ->
                    Pill("$min min", {
                        app.sleep.value = com.mimo.app.playback.SleepTimer(at = System.currentTimeMillis() + min * 60_000L)
                        toast("Music stops in $min minutes")
                    }, filled = false)
                }
            }
        }
        when {
            songs.data != null -> { item { PlayShuffle(songs.data) }; tracks(songs.data) }
            songs.error -> item { ErrorNote(songs.retry) }
            else -> item { Loading() }
        }
    }
}

@Composable
fun LikedScreen() {
    val lib by app().library.state.collectAsState()
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item { PageHeader("Liked", hl = "Songs", eyebrow = "${lib.liked.size} songs you love") }
        item { PlayShuffle(lib.liked) }
        item { Spacer(Modifier.height(10.dp)) }
        if (lib.liked.isEmpty()) item { Loading("Tap ♡ on any song to keep it here.") }
        tracks(lib.liked)
    }
}

@Composable
fun RecentScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar { if (lib.history.isNotEmpty()) Pill("Clear", { app.library.update { it.copy(history = emptyList()) } }, filled = false) } }
        item { PageHeader("Recently", hl = "Played", eyebrow = "Last 100 songs") }
        if (lib.history.isEmpty()) item { Loading("Songs you play for 30 seconds or more show up here.") }
        tracks(lib.history)
    }
}
