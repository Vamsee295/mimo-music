package com.mimo.app.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyHorizontalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import coil3.compose.AsyncImage
import com.mimo.app.data.Album
import com.mimo.app.data.App
import com.mimo.app.data.Track
import com.mimo.app.data.art
import kotlinx.coroutines.CancellationException

// The editorial building blocks (components/ui.tsx), in Compose.

val LocalToast = staticCompositionLocalOf<(String) -> Unit> { {} }

@Composable fun app(): App = App.get(LocalContext.current)

@Composable
fun Icon(name: String, modifier: Modifier = Modifier, tint: Color = Mimo.colors.ink, size: Dp = 22.dp) =
    androidx.compose.material3.Icon(icon(name), contentDescription = null, tint = tint, modifier = modifier.size(size))

@Composable
fun IconBtn(name: String, label: String, onClick: () -> Unit, tint: Color = Mimo.colors.ink, size: Dp = 22.dp, enabled: Boolean = true) =
    Box(
        Modifier.size(size + 22.dp).clip(CircleShape).clickable(enabled = enabled, onClickLabel = label, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(name, tint = if (enabled) tint else tint.copy(alpha = 0.3f), size = size) }

@Composable
fun Cover(url: String?, modifier: Modifier = Modifier, px: Int = 300, radius: Dp = 10.dp) =
    AsyncImage(
        model = url?.let { art(it, px) },
        contentDescription = null,
        contentScale = ContentScale.Crop,
        modifier = modifier.clip(RoundedCornerShape(radius)).background(Mimo.colors.card2),
    )

/** Eyebrow, huge Anton title with an optional rust word-block, handwritten note. */
@Composable
fun PageHeader(title: String, hl: String? = null, eyebrow: String? = null, note: String? = null, trailing: @Composable () -> Unit = {}) {
    val c = Mimo.colors
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 20.dp)) {
        if (eyebrow != null) Text(eyebrow.uppercase(), style = MimoType.eyebrow, color = c.accent, modifier = Modifier.padding(bottom = 6.dp))
        Row(verticalAlignment = Alignment.Top) {
            Box(Modifier.weight(1f)) { Headline(title, hl, 44.sp) }
            trailing()
        }
        if (note != null) Text(note, style = MimoType.note, color = c.note, modifier = Modifier.padding(top = 6.dp).graphicsLayer { rotationZ = -1f })
    }
}

@Composable
fun Headline(title: String, hl: String?, size: androidx.compose.ui.unit.TextUnit) {
    val c = Mimo.colors
    // the word-block is a background span: wraps with the text like the web's inline .hl
    Text(
        buildAnnotatedString {
            append(title.uppercase())
            if (hl != null) {
                append(" ")
                withStyle(SpanStyle(background = c.accent, color = c.paper)) { append(" ${hl.uppercase()} ") }
            }
        },
        style = MimoType.display.copy(fontSize = size, lineHeight = size * 1.02f),
        color = c.ink,
    )
}

/** "01 / KICKER" + Anton title, optional › to a full page. */
@Composable
fun SectionTitle(n: Int, kicker: String, title: String, onMore: (() -> Unit)? = null) {
    val c = Mimo.colors
    Column(
        Modifier.fillMaxWidth().then(if (onMore != null) Modifier.clickable(onClick = onMore) else Modifier)
            .padding(start = 20.dp, end = 20.dp, top = 28.dp, bottom = 12.dp),
    ) {
        Text("%02d / %s".format(n, kicker.uppercase()), style = MimoType.eyebrow, color = c.accent)
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title.uppercase(), style = MimoType.display.copy(fontSize = 28.sp, lineHeight = 30.sp), color = c.ink, modifier = Modifier.weight(1f, fill = false))
            if (onMore != null) Icon("right", size = 26.dp)
        }
    }
}

@Composable
fun Pill(label: String, onClick: () -> Unit, filled: Boolean = true, icon: String? = null, enabled: Boolean = true, accent: Boolean = false) {
    val c = Mimo.colors
    val bg = if (accent) c.accent else if (filled) c.ink else Color.Transparent
    val fg = if (filled || accent) c.paper else c.ink
    Row(
        Modifier.clip(RoundedCornerShape(999.dp)).background(bg).border(2.dp, if (filled || accent) bg else c.line, RoundedCornerShape(999.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 18.dp, vertical = 10.dp)
            .graphicsLayer { alpha = if (enabled) 1f else 0.45f },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (icon != null) Icon(icon, tint = fg, size = 18.dp)
        Text(label.uppercase(), style = MimoType.label, color = fg)
    }
}

@Composable
fun PlayShuffle(tracks: List<Track>, modifier: Modifier = Modifier) {
    val p = LocalPlayer.current
    Row(modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Pill("Play", { p.playList(tracks, 0, shuffle = false) }, icon = "play", enabled = tracks.isNotEmpty())
        Pill("Shuffle", { p.playList(tracks, -1, shuffle = true) }, filled = false, icon = "shuffle", enabled = tracks.isNotEmpty())
    }
}

@Composable
fun Explicit() = Box(Modifier.padding(start = 6.dp).size(14.dp).background(Mimo.colors.ink, RoundedCornerShape(3.dp)), contentAlignment = Alignment.Center) {
    Text("E", style = MimoType.eyebrow.copy(fontSize = 9.sp, letterSpacing = 0.sp), color = Mimo.colors.paper)
}

/** One song: art (or its number on an album), title, artist, ⋯ menu. Long-press opens the menu too. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TrackRow(
    t: Track,
    onClick: () -> Unit,
    number: Int? = null,
    onRemove: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val c = Mimo.colors
    val p = LocalPlayer.current
    val playing = p.current?.id == t.id
    var menu by remember { mutableStateOf(false) }
    Row(
        modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = { menu = true }).padding(horizontal = 20.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (number != null) Text(
            if (playing) "♪" else "$number", style = MimoType.eyebrow.copy(fontSize = 14.sp),
            color = if (playing) c.accent else c.ink.copy(alpha = 0.5f), modifier = Modifier.width(30.dp),
        ) else Cover(t.art, Modifier.size(48.dp), px = 120, radius = 8.dp)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(t.title, style = MimoType.body.copy(fontSize = 15.sp), color = if (playing) c.accent else c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (t.explicit) Explicit()
            }
            Text(t.artist, style = MimoType.body.copy(fontSize = 13.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box {
            IconBtn("more", "More", { menu = true }, tint = c.ink.copy(alpha = 0.6f), size = 20.dp)
            TrackMenu(t, menu, { menu = false }, onRemove)
        }
    }
}

@Composable
fun TrackMenu(t: Track, open: Boolean, onClose: () -> Unit, onRemove: (() -> Unit)? = null) {
    val p = LocalPlayer.current
    val nav = LocalNav.current
    val toast = LocalToast.current
    val app = app()
    val lib by app.library.state.collectAsState()
    var pick by remember { mutableStateOf(false) }
    val c = Mimo.colors
    DropdownMenu(open, onClose, containerColor = c.card, border = BorderStroke(2.dp, c.line), shape = RoundedCornerShape(14.dp)) {
        @Composable fun item(label: String, ico: String, action: () -> Unit) = DropdownMenuItem(
            text = { Text(label, style = MimoType.body, color = c.ink) },
            leadingIcon = { Icon(ico, tint = c.accent, size = 20.dp) },
            onClick = { onClose(); action() },
        )
        item("Play next", "queue") { p.playNext(t); toast("Plays next") }
        item("Add to queue", "list") { p.addToQueue(t); toast("Added to queue") }
        item(if (lib.isLiked(t.id)) "Remove from Liked" else "Love", if (lib.isLiked(t.id)) "heart" else "heartOutline") { app.library.update { it.toggleLike(t) } }
        val saved = lib.songs.any { it.id == t.id }
        item(if (saved) "Remove from Library" else "Add to Library", if (saved) "check" else "plus") { app.library.update { it.toggleSong(t) } }
        item("Add to playlist…", "plus") { pick = true }
        if (t.albumId.isNotEmpty()) item("Go to album", "grid") { nav.go(Screen.AlbumPage(t.albumId)) }
        if (t.artistId.isNotEmpty()) item("Go to artist", "user") { nav.go(Screen.ArtistPage(t.artistId, t.artist)) }
        if (onRemove != null) item("Remove", "trash", onRemove)
    }
    if (pick) AddToPlaylist(t) { pick = false }
}

@Composable
fun AddToPlaylist(t: Track, onDone: () -> Unit) {
    val app = app()
    val toast = LocalToast.current
    val lib by app.library.state.collectAsState()
    var name by remember { mutableStateOf("") }
    val c = Mimo.colors
    Dialog(onDone) {
        Column(Modifier.fillMaxWidth().brut(c).padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("ADD TO PLAYLIST", style = MimoType.label, color = c.ink)
            lib.playlists.forEach { pl ->
                Text(pl.name, style = MimoType.body, color = c.ink, modifier = Modifier.fillMaxWidth().clickable {
                    app.library.update { it.addToPlaylist(pl.id, t) }; toast("Added to ${pl.name}"); onDone()
                }.padding(vertical = 10.dp))
            }
            Field(name, { name = it }, "New playlist name")
            Pill("Create", {
                app.library.update { it.createPlaylist(name.trim(), t) }; toast("Created ${name.trim()}"); onDone()
            }, enabled = name.isNotBlank())
        }
    }
}

@Composable
fun Field(value: String, onChange: (String) -> Unit, hint: String, modifier: Modifier = Modifier, leading: String? = null) {
    val c = Mimo.colors
    Row(
        modifier.fillMaxWidth().background(c.card, RoundedCornerShape(12.dp)).border(2.dp, c.line, RoundedCornerShape(12.dp)).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) Icon(leading, tint = c.ink.copy(alpha = 0.6f), size = 20.dp, modifier = Modifier.padding(end = 10.dp))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(hint, style = MimoType.body, color = c.ink.copy(alpha = 0.4f))
            BasicTextField(value, onChange, singleLine = true, textStyle = MimoType.body.copy(color = c.ink),
                cursorBrush = androidx.compose.ui.graphics.SolidColor(c.accent), modifier = Modifier.fillMaxWidth())
        }
        if (value.isNotEmpty()) IconBtn("close", "Clear", { onChange("") }, tint = c.ink.copy(alpha = 0.5f), size = 18.dp)
    }
}

/** Outlined album card with the hard shadow. */
@Composable
fun AlbumCard(a: Album, width: Dp = 160.dp) {
    val c = Mimo.colors
    val nav = LocalNav.current
    Column(Modifier.width(width).clickable { nav.go(Screen.AlbumPage(a.id, a)) }) {
        Box(Modifier.brut(c, radius = 14.dp).padding(6.dp)) { Cover(a.art, Modifier.fillMaxWidth().aspectRatio(1f), px = 400) }
        Text(a.title, style = MimoType.body.copy(fontSize = 14.sp), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 10.dp))
        Text(a.artist, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

fun LazyListScope.albumShelf(albums: List<Album>) = item { AlbumShelf(albums) }
fun LazyListScope.section(n: Int, kicker: String, title: String, onMore: (() -> Unit)? = null) = item { SectionTitle(n, kicker, title, onMore) }

@Composable
fun AlbumShelf(albums: List<Album>) {
    LazyRow(contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 8.dp, top = 2.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        items(albums, key = { it.id }) { AlbumCard(it) }
    }
}

/** Songs in 3 rows that scroll sideways (the web's SongGrid). Tapping plays the whole set from there. */
fun LazyListScope.songGrid(tracks: List<Track>) = item { SongGrid(tracks) }

@Composable
fun SongGrid(tracks: List<Track>) {
    val p = LocalPlayer.current
    val rows = minOf(3, tracks.size).coerceAtLeast(1)
    LazyHorizontalGrid(
        GridCells.Fixed(rows), Modifier.height((64 * rows).dp), contentPadding = PaddingValues(end = 8.dp),
    ) {
        itemsIndexed(tracks, key = { i, t -> "$i:${t.id}" }) { i, t ->
            TrackRow(t, { p.playList(tracks, i) }, modifier = Modifier.width(310.dp))
        }
    }
}

@Composable
fun Loading(label: String = "Loading…") =
    Text(label, style = MimoType.note, color = Mimo.colors.note, modifier = Modifier.fillMaxWidth().padding(24.dp))

@Composable
fun ErrorNote(onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(20.dp).brut(Mimo.colors).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Couldn't load this. Check your connection.", style = MimoType.body, color = Mimo.colors.ink)
        Pill("Try again", onRetry, filled = false)
    }
}

/** Loads once per key; `retry()` loads again. */
class Load<T>(val data: T?, val error: Boolean, val retry: () -> Unit)

@Composable
fun <T> rememberLoad(vararg keys: Any?, fn: suspend () -> T): Load<T> {
    var attempt by remember { mutableIntStateOf(0) }
    var data by remember(*keys) { mutableStateOf<T?>(null) }
    var error by remember(*keys) { mutableStateOf(false) }
    LaunchedEffect(*keys, attempt) {
        error = false
        try { data = fn() } catch (e: CancellationException) { throw e } catch (e: Exception) { error = true }
    }
    return Load(data, error && data == null) { attempt++ }
}

/** Standard bottom gap so the mini player and tabs never cover the last row. */
val BottomGap = 150.dp
