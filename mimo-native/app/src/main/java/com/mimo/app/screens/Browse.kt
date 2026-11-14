package com.mimo.app.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.mimo.app.data.*
import com.mimo.app.ui.*
import kotlinx.coroutines.delay

// Search and Library (app/search/page.tsx, app/library/page.tsx).

@Composable
fun SearchScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val p = LocalPlayer.current
    val c = Mimo.colors
    var q by rememberSaveable { mutableStateOf("") }
    var debounced by remember { mutableStateOf(q) }
    LaunchedEffect(q) { delay(400); debounced = q.trim() }
    val results = if (debounced.length >= 2) rememberLoad("search:$debounced") { app.catalog.search(debounced) } else null

    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { PageHeader("Search", eyebrow = "Every song on Apple's catalogue", trailing = { ProfileButton() }) }
        item { Field(q, { q = it }, "Songs, albums, artists", Modifier.padding(horizontal = 20.dp), leading = "search") }

        if (results == null) {
            if (lib.recentSearches.isNotEmpty()) {
                section(1, "Recent", "Recently Searched")
                items(lib.recentSearches, key = { it.key }) { r -> RecentRow(r, onQuery = { q = it }) }
            }
            section(if (lib.recentSearches.isEmpty()) 1 else 2, "Browse", "Genres")
            item { GenreTiles() }
        } else when {
            results.data != null -> {
                val r = results.data
                if (r.songs.isEmpty() && r.albums.isEmpty()) item { Loading("Nothing found for “$debounced”") }
                if (r.artists.isNotEmpty()) {
                    section(1, "Artists", "Artists")
                    item {
                        LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                            items(r.artists, key = { it.id }) { a ->
                                Column(Modifier.width(96.dp).clickable {
                                    app.library.update { it.addRecent(Recent.ArtistRef(a.id, a.name)) }
                                    nav.go(Screen.ArtistPage(a.id, a.name))
                                }, horizontalAlignment = Alignment.CenterHorizontally) {
                                    ArtistAvatar(a.name, 84.dp)
                                    Text(a.name, style = MimoType.body.copy(fontSize = 13.sp), color = c.ink, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 6.dp))
                                }
                            }
                        }
                    }
                }
                if (r.songs.isNotEmpty()) {
                    section(2, "Songs", "Songs")
                    itemsIndexed(r.songs.take(20), key = { i, t -> "s$i${t.id}" }) { i, t ->
                        TrackRow(t, {
                            app.library.update { it.addRecent(Recent.Query(debounced)).addRecent(Recent.Song(t)) }
                            p.playList(r.songs, i)
                        })
                    }
                }
                if (r.albums.isNotEmpty()) {
                    section(3, "Albums", "Albums")
                    albumShelf(r.albums)
                }
            }
            results.error -> item { ErrorNote(results.retry) }
            else -> item { Loading("Searching…") }
        }
    }
}

@Composable
private fun RecentRow(r: Recent, onQuery: (String) -> Unit) {
    val app = app()
    val nav = LocalNav.current
    val p = LocalPlayer.current
    val c = Mimo.colors
    val (title, sub, art) = when (r) {
        is Recent.Song -> Triple(r.track.title, "Song · ${r.track.artist}", r.track.art)
        is Recent.ArtistRef -> Triple(r.name, "Artist", null)
        is Recent.AlbumRef -> Triple(r.album.title, "Album · ${r.album.artist}", r.album.art)
        is Recent.Query -> Triple(r.q, "Search", null)
    }
    Row(
        Modifier.fillMaxWidth().clickable {
            when (r) {
                is Recent.Song -> p.playList(listOf(r.track))
                is Recent.ArtistRef -> nav.go(Screen.ArtistPage(r.id, r.name))
                is Recent.AlbumRef -> nav.go(Screen.AlbumPage(r.album.id, r.album))
                is Recent.Query -> onQuery(r.q)
            }
        }.padding(horizontal = 20.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (art != null) Cover(art, Modifier.size(44.dp), px = 120, radius = 8.dp)
        else Box(Modifier.size(44.dp).clip(RoundedCornerShape(8.dp)).background(c.card2), contentAlignment = Alignment.Center) {
            Icon(if (r is Recent.ArtistRef) "user" else "search", tint = c.ink.copy(alpha = 0.6f), size = 20.dp)
        }
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(title, style = MimoType.body, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 1)
        }
        IconBtn("close", "Remove", { app.library.update { it.removeRecent(r.key) } }, tint = c.ink.copy(alpha = 0.4f), size = 18.dp)
    }
}

private enum class LibTab(val label: String) { PLAYLISTS("Playlists"), SONGS("Songs"), ALBUMS("Albums"), ARTISTS("Artists") }

@Composable
fun LibraryScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val p = LocalPlayer.current
    val c = Mimo.colors
    var tab by rememberSaveable { mutableStateOf(LibTab.PLAYLISTS) }
    var creating by remember { mutableStateOf(false) }

    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { PageHeader("Your", hl = "Library", eyebrow = "Saved on this phone", trailing = { ProfileButton() }) }
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items(LibTab.entries) { t -> Pill(t.label, { tab = t }, filled = tab == t) }
            }
        }
        item { Spacer(Modifier.height(12.dp)) }
        when (tab) {
            LibTab.PLAYLISTS -> {
                item { LibRow("Liked Songs", "${lib.liked.size} songs", "heart", accent = true) { nav.go(Screen.Liked) } }
                item { LibRow("Recently Played", "${lib.history.size} songs", "clock") { nav.go(Screen.Recent) } }
                Mood.entries.forEach { m -> item(key = m.name) { LibRow("${m.title} ${m.hl}", m.eyebrow, if (m == Mood.STUDY) "note" else "moon") { nav.go(Screen.MoodPage(m)) } } }
                item { LibRow("Replay", "Your top songs and artists", "radio") { nav.go(Screen.Replay) } }
                val pinned = lib.playlists.sortedByDescending { "playlist:${it.id}" in lib.pinned }
                items(pinned, key = { it.id }) { pl ->
                    LibRow(pl.name, "Playlist · ${pl.tracks.size} songs", "list", art = pl.tracks.map { it.art }, pinned = "playlist:${pl.id}" in lib.pinned) { nav.go(Screen.PlaylistPage(pl.id)) }
                }
                item { Box(Modifier.padding(20.dp)) { Pill("New playlist", { creating = true }, icon = "plus", filled = false) } }
            }
            LibTab.SONGS -> {
                if (lib.songs.isEmpty()) item { Loading("Songs you add to your Library show up here.") }
                else {
                    item { PlayShuffle(lib.songs) }
                    item { Spacer(Modifier.height(8.dp)) }
                    itemsIndexed(lib.songs.asReversed(), key = { _, t -> t.id }) { i, t -> TrackRow(t, { p.playList(lib.songs.asReversed(), i) }) }
                }
            }
            LibTab.ALBUMS -> {
                if (lib.albums.isEmpty()) item { Loading("Albums you save show up here.") }
                items(lib.albums.chunked(2), key = { it.first().id }) { pair ->
                    Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        pair.forEach { a -> Box(Modifier.weight(1f)) { AlbumCard(a, width = 400.dp) } }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
            LibTab.ARTISTS -> {
                // built from your saved and loved songs, like the web app
                val artists = (lib.songs + lib.liked).filter { it.artistId.isNotEmpty() && it.artistId !in lib.hiddenArtists }
                    .groupBy { it.artistId }.map { (id, ts) -> Triple(id, mainArtist(ts.first().artist), ts.size) }.sortedByDescending { it.third }
                if (artists.isEmpty()) item { Loading("Artists of the songs you save show up here.") }
                items(artists, key = { it.first }) { (id, name, count) ->
                    Row(Modifier.fillMaxWidth().clickable { nav.go(Screen.ArtistPage(id, name)) }.padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                        ArtistAvatar(name, 52.dp)
                        Column(Modifier.weight(1f).padding(start = 14.dp)) {
                            Text(name, style = MimoType.body, color = c.ink)
                            Text("$count saved songs", style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f))
                        }
                        IconBtn("close", "Hide artist", { app.library.update { it.hideArtist(id) } }, tint = c.ink.copy(alpha = 0.4f), size = 18.dp)
                    }
                }
            }
        }
    }
    if (creating) NameDialog("New playlist", "", onDone = { creating = false }) { name -> app.library.update { it.createPlaylist(name) } }
}

@Composable
private fun LibRow(title: String, sub: String, ico: String, accent: Boolean = false, art: List<String> = emptyList(), pinned: Boolean = false, onClick: () -> Unit) {
    val c = Mimo.colors
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (art.isNotEmpty()) Box(Modifier.size(56.dp)) { Mosaic(art) }
        else Box(Modifier.size(56.dp).clip(RoundedCornerShape(10.dp)).background(if (accent) c.accent else c.card2).border(2.dp, c.line, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Icon(ico, tint = if (accent) c.paper else c.accent, size = 26.dp)
        }
        Column(Modifier.weight(1f).padding(start = 14.dp)) {
            Text(title, style = MimoType.label.copy(fontSize = 17.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 1)
        }
        if (pinned) Icon("pin", tint = c.accent, size = 18.dp)
        Icon("right", tint = c.ink.copy(alpha = 0.4f))
    }
}

/** One text field + Save, for naming a playlist. */
@Composable
fun NameDialog(title: String, initial: String, onDone: () -> Unit, onSave: (String) -> Unit) {
    var name by remember { mutableStateOf(initial) }
    val c = Mimo.colors
    Dialog(onDone) {
        Column(Modifier.fillMaxWidth().brut(c).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(title.uppercase(), style = MimoType.label, color = c.ink)
            Field(name, { name = it.take(60) }, "Name")
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pill("Save", { onSave(name.trim()); onDone() }, enabled = name.isNotBlank())
                Pill("Cancel", onDone, filled = false)
            }
        }
    }
}
