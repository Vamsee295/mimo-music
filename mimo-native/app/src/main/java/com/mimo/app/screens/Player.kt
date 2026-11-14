package com.mimo.app.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import com.mimo.app.data.*
import com.mimo.app.playback.SleepTimer
import com.mimo.app.ui.*
import kotlinx.coroutines.delay

// Mini player and full-screen Now Playing (components/PlayerBar.tsx).

private fun fmt(ms: Long) = if (ms < 0) "0:00" else "%d:%02d".format(ms / 60000, ms / 1000 % 60)

/** Position, refreshed 4x a second while shown (the controller doesn't push it). */
@Composable
private fun rememberPosition(): Long {
    val p = LocalPlayer.current
    var pos by remember { mutableLongStateOf(p.positionMs) }
    LaunchedEffect(Unit) { while (true) { pos = p.positionMs; delay(250) } }
    return pos
}

@Composable
fun MiniPlayer(onOpen: () -> Unit) {
    val p = LocalPlayer.current
    val c = Mimo.colors
    val t = p.current ?: return
    val pos = rememberPosition()
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).fillMaxWidth().brut(c, radius = 16.dp, shadow = androidx.compose.ui.geometry.Offset(3f, 4f)).clip(RoundedCornerShape(16.dp)).clickable(onClick = onOpen)) {
        Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(t.art, Modifier.size(46.dp), px = 120, radius = 10.dp)
            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                Text(t.title, style = MimoType.body.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold), color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(p.error ?: t.artist, style = MimoType.body.copy(fontSize = 12.sp), color = if (p.error != null) c.accent else c.ink.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            IconBtn(if (p.isPlaying || p.buffering) "pause" else "play", "Play or pause", { p.toggle() }, size = 28.dp)
            IconBtn("next", "Next", { p.next() }, size = 24.dp, enabled = p.index < p.tracks.size - 1)
        }
        val frac = if (p.durationMs > 0) (pos.toFloat() / p.durationMs).coerceIn(0f, 1f) else 0f
        Box(Modifier.fillMaxWidth().height(3.dp).background(c.ink.copy(alpha = 0.1f))) {
            Box(Modifier.fillMaxWidth(frac).fillMaxHeight().background(c.accent))
        }
    }
}

private enum class View { ART, LYRICS, QUEUE }

/** The cover's vivid colour (data/ArtColor.kt), or null while it loads. Only Now Playing is tinted. */
@Composable
private fun rememberArtColor(url: String): Color? {
    val ctx = LocalContext.current
    val color by produceState<Color?>(null, url) {
        value = runCatching {
            val r = SingletonImageLoader.get(ctx).execute(ImageRequest.Builder(ctx).data(art(url, 100)).size(24).allowHardware(false).build())
            val b = (r as? SuccessResult)?.image?.toBitmap() ?: return@runCatching null
            val px = IntArray(b.width * b.height).also { b.getPixels(it, 0, b.width, 0, 0, b.width, b.height) }
            vividColor(px)?.let { Color(0xFF000000.toInt() or it) }
        }.getOrNull()
    }
    return color
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NowPlaying(onClose: () -> Unit) {
    val p = LocalPlayer.current
    val nav = LocalNav.current
    val app = app()
    val lib by app.library.state.collectAsState()
    val t = p.current ?: return
    val tint = rememberArtColor(t.art)
    // dark island over the cover's colour, like Apple Music: the rest of the app stays editorial
    val base by animateColorAsState(tint?.let { lerp(it, Color.Black, 0.55f) } ?: Color(0xFF1C1A18), tween(600), label = "tint")
    val white = Color(0xFFF5EFE6)
    var view by remember { mutableStateOf(View.ART) }
    var menu by remember { mutableStateOf(false) }
    var dragging by remember { mutableStateOf<Float?>(null) }
    val pos = rememberPosition()

    Column(
        Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(base, lerp(base, Color.Black, 0.6f))))
            .clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) {} // swallow taps: nothing behind Now Playing reacts
            .systemBarsPadding().padding(horizontal = 22.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            IconBtn("down", "Close", onClose, tint = white, size = 30.dp)
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("NOW PLAYING", style = MimoType.eyebrow, color = white.copy(alpha = 0.6f))
                Text(t.album, style = MimoType.body.copy(fontSize = 12.sp), color = white.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            Box {
                IconBtn("more", "More", { menu = true }, tint = white)
                TrackMenu(t, menu, { menu = false })
            }
        }

        Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
            when (view) {
                View.ART -> Cover(
                    t.art, Modifier.fillMaxWidth().aspectRatio(1f).shadow(24.dp, RoundedCornerShape(16.dp)),
                    px = 1000, radius = 16.dp,
                )
                View.LYRICS -> LyricsView(t, pos, white)
                View.QUEUE -> QueueView(white)
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(t.title, style = MimoType.display.copy(fontSize = 26.sp, lineHeight = 28.sp), color = white, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(t.artist, style = MimoType.body.copy(fontSize = 15.sp), color = white.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable(enabled = t.artistId.isNotEmpty()) { onClose(); nav.go(Screen.ArtistPage(t.artistId, t.artist)) })
            }
            val liked = lib.isLiked(t.id)
            IconBtn(if (liked) "heart" else "heartOutline", "Love", { app.library.update { it.toggleLike(t) } }, tint = if (liked) Mimo.colors.accent else white, size = 26.dp)
        }
        p.error?.let { Text(it, style = MimoType.body.copy(fontSize = 13.sp), color = Color(0xFFFF9C7A), modifier = Modifier.padding(top = 4.dp)) }

        val dur = p.durationMs.coerceAtLeast(1)
        Slider(
            value = dragging ?: (pos.toFloat() / dur).coerceIn(0f, 1f),
            onValueChange = { dragging = it },
            onValueChangeFinished = { dragging?.let { p.seekTo((it * dur).toLong()) }; dragging = null },
            colors = SliderDefaults.colors(thumbColor = white, activeTrackColor = white, inactiveTrackColor = white.copy(alpha = 0.25f)),
            thumb = { Box(Modifier.size(14.dp).background(white, CircleShape)) },
            modifier = Modifier.padding(top = 6.dp),
        )
        Row {
            Text(fmt(dragging?.let { (it * dur).toLong() } ?: pos), style = MimoType.eyebrow, color = white.copy(alpha = 0.6f))
            Spacer(Modifier.weight(1f))
            Text("-" + fmt(dur - pos), style = MimoType.eyebrow, color = white.copy(alpha = 0.6f))
        }

        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconBtn("shuffle", "Shuffle", { p.toggleShuffle() }, tint = if (p.shuffle) Mimo.colors.accent else white.copy(alpha = 0.7f))
            IconBtn("rewind", "Previous", { p.prev() }, tint = white, size = 34.dp)
            Box(
                Modifier.size(76.dp).clip(CircleShape).background(white).clickable { p.toggle() },
                contentAlignment = Alignment.Center,
            ) { Icon(if (p.isPlaying || p.buffering) "pauseSoft" else "playSoft", tint = base, size = 36.dp) }
            IconBtn("forward", "Next", { p.next() }, tint = white, size = 34.dp, enabled = p.index < p.tracks.size - 1 || p.repeat == Repeat.ALL)
            Box {
                IconBtn("repeat", "Repeat", { p.cycleRepeat() }, tint = if (p.repeat != Repeat.OFF) Mimo.colors.accent else white.copy(alpha = 0.7f))
                if (p.repeat == Repeat.ONE) Text("1", style = MimoType.eyebrow.copy(fontSize = 10.sp), color = Mimo.colors.accent, modifier = Modifier.align(Alignment.TopEnd).padding(end = 6.dp, top = 4.dp))
            }
        }

        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconBtn("lyricsBubble", "Lyrics", { view = if (view == View.LYRICS) View.ART else View.LYRICS }, tint = if (view == View.LYRICS) Mimo.colors.accent else white.copy(alpha = 0.75f))
            SleepButton(white)
            IconBtn("list", "Up next", { view = if (view == View.QUEUE) View.ART else View.QUEUE }, tint = if (view == View.QUEUE) Mimo.colors.accent else white.copy(alpha = 0.75f))
        }
    }
}

@Composable
private fun SleepButton(white: Color) {
    val app = app()
    val toast = LocalToast.current
    val sleep by app.sleep.collectAsState()
    var open by remember { mutableStateOf(false) }
    val on = sleep.at != null || sleep.afterSong
    val c = Mimo.colors
    Box {
        Row(Modifier.clip(RoundedCornerShape(999.dp)).clickable { open = true }.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon("moon", tint = if (on) c.accent else white.copy(alpha = 0.75f), size = 20.dp)
            val left = sleep.at?.let { ((it - System.currentTimeMillis()) / 60_000).coerceAtLeast(0) + 1 }
            if (on) Text(if (sleep.afterSong) " END OF SONG" else " ${left} MIN", style = MimoType.label.copy(fontSize = 13.sp), color = c.accent)
        }
        DropdownMenu(open, { open = false }, containerColor = c.card) {
            @Composable fun opt(label: String, s: SleepTimer, msg: String) = DropdownMenuItem(
                text = { Text(label, style = MimoType.body, color = c.ink) },
                onClick = { open = false; app.sleep.value = s; toast(msg) },
            )
            listOf(15, 30, 45, 60).forEach { m -> opt("$m minutes", SleepTimer(at = System.currentTimeMillis() + m * 60_000L), "Music stops in $m minutes") }
            opt("End of this song", SleepTimer(afterSong = true), "Music stops after this song")
            if (on) opt("Turn off", SleepTimer(), "Sleep timer off")
        }
    }
}

@Composable
private fun LyricsView(t: Track, pos: Long, white: Color) {
    val app = app()
    val lib by app.library.state.collectAsState()
    val p = LocalPlayer.current
    val load = rememberLoad("lyrics:${t.id}") { listOf(app.extras.getLyrics(t)) } // wrapped: "no lyrics" (null) ≠ still loading
    var roman by remember { mutableStateOf(false) }
    val l = load.data?.first()
    val style = MimoType.display.copy(fontSize = 26.sp, lineHeight = 32.sp, letterSpacing = 0.sp)
    when {
        load.error -> Text("Couldn't load lyrics. Check your connection.", style = MimoType.body, color = white.copy(alpha = 0.7f))
        l == null -> Text(if (load.data == null) "Looking for lyrics…" else "No lyrics for this song yet.", style = MimoType.note, color = white.copy(alpha = 0.7f))
        l.instrumental -> Text("♪ Instrumental", style = style, color = white.copy(alpha = 0.7f))
        else -> Column(Modifier.fillMaxSize()) {
            val text = (l.synced?.map { it.text } ?: listOf(l.plain ?: "")).joinToString("\n")
            if (hasIndic(text)) Text(
                if (roman) "ORIGINAL SCRIPT" else "ENGLISH LETTERS", style = MimoType.label.copy(fontSize = 12.sp), color = Mimo.colors.accent,
                modifier = Modifier.align(Alignment.End).clip(RoundedCornerShape(999.dp)).border(1.5.dp, Mimo.colors.accent, RoundedCornerShape(999.dp))
                    .clickable { roman = !roman }.padding(horizontal = 10.dp, vertical = 4.dp),
            )
            fun shown(s: String) = if (roman) romanize(s) else s
            val synced = l.synced?.takeIf { it.isNotEmpty() && lib.settings.syncedLyrics }
            if (synced == null) Text(shown(l.plain ?: text), style = MimoType.body.copy(fontSize = 18.sp, lineHeight = 28.sp), color = white,
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(top = 8.dp))
            else {
                val now = synced.indexOfLast { it.t * 1000 <= pos + 300 }
                val list = rememberLazyListState()
                LaunchedEffect(now) { if (now >= 0) list.animateScrollToItem(now, -200) }
                LazyColumn(state = list, verticalArrangement = Arrangement.spacedBy(14.dp), contentPadding = PaddingValues(vertical = 120.dp)) {
                    itemsIndexed(synced) { i, line ->
                        Text(
                            shown(line.text).ifEmpty { "♪" }, style = style,
                            color = when { i == now -> white; i < now -> white.copy(alpha = 0.35f); else -> white.copy(alpha = 0.5f) },
                            modifier = Modifier.fillMaxWidth().clickable { p.seekTo((line.t * 1000).toLong()) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueView(white: Color) {
    val p = LocalPlayer.current
    val autoplay = app().library.state.collectAsState().value.settings.autoplay
    Column(Modifier.fillMaxSize()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("UP NEXT", style = MimoType.label, color = white, modifier = Modifier.weight(1f))
            if (p.index < p.tracks.size - 1) Text("CLEAR", style = MimoType.label.copy(fontSize = 13.sp), color = Mimo.colors.accent, modifier = Modifier.clickable { p.clearUpcoming() }.padding(8.dp))
        }
        val upcoming = p.tracks.withIndex().drop(p.index + 1)
        if (upcoming.isEmpty()) Text(if (autoplay) "Autoplay will add similar songs when this one starts." else "Nothing queued.", style = MimoType.note, color = white.copy(alpha = 0.6f))
        LazyColumn {
            itemsIndexed(upcoming, key = { _, (i, t) -> "$i:${t.id}" }) { _, (i, t) ->
                Row(Modifier.fillMaxWidth().clickable { p.jumpTo(i) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Cover(t.art, Modifier.size(44.dp), px = 120, radius = 8.dp)
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(t.title, style = MimoType.body, color = white, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(t.artist, style = MimoType.body.copy(fontSize = 12.sp), color = white.copy(alpha = 0.6f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (i > p.index + 1) IconBtn("queue", "Play next", { p.move(i, p.index + 1) }, tint = white.copy(alpha = 0.6f), size = 18.dp)
                    IconBtn("close", "Remove", { p.removeAt(i) }, tint = white.copy(alpha = 0.6f), size = 18.dp)
                }
            }
        }
    }
}
