package com.mimo.app.screens

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import kotlinx.coroutines.launch
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput

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
    // "Hukum (From "Jailer")" → title "Hukum", and "Jailer" goes in the line above; "… - Single" albums lose the suffix
    val title = cleanTitle(t.title)
    val from = Regex("""\(from\s+["“]?([^"”)]+)["”]?\)""", RegexOption.IGNORE_CASE).find(t.title)?.groupValues?.get(1) ?: cleanTitle(t.album)
    val hasKey = looksLikeKey(cleanKey(lib.ytKey))
    val pull = rememberPullToClose(enabled = view == View.ART && !menu, onClose = onClose)

    Column(
        Modifier.fillMaxSize()
            .then(pull.modifier)
            .background(Brush.verticalGradient(listOf(base, lerp(base, Color.Black, 0.6f))))
            .clickable(interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }, indication = null) {} // swallow taps: nothing behind Now Playing reacts
            .systemBarsPadding().padding(horizontal = 20.dp),
    ) {
        // grabber: press and pull the sheet down to close (it's only a handle, tapping does nothing; Back still closes)
        Box(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.width(40.dp).height(5.dp).clip(RoundedCornerShape(999.dp)).background(white.copy(alpha = 0.4f)))
        }
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("PLAYING FROM", style = MimoType.eyebrow.copy(fontSize = 10.sp), color = white.copy(alpha = 0.45f))
            Text(from, style = MimoType.body.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium), color = white.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable(enabled = t.albumId.isNotEmpty()) { onClose(); nav.go(Screen.AlbumPage(t.albumId)) })
        }

        Box(Modifier.weight(1f).fillMaxWidth().padding(vertical = 14.dp), contentAlignment = Alignment.Center) {
            when (view) {
                View.ART -> {
                    // the cover settles back a little while paused (Apple Music)
                    val scale by androidx.compose.animation.core.animateFloatAsState(if (p.isPlaying || p.buffering) 1f else 0.9f, tween(500), label = "cover")
                    Cover(
                        t.art, Modifier.fillMaxWidth().aspectRatio(1f).graphicsLayer { scaleX = scale; scaleY = scale }.shadow(24.dp, RoundedCornerShape(16.dp)),
                        px = 1000, radius = 16.dp,
                    )
                }
                View.LYRICS -> LyricsView(t, pos, white)
                View.QUEUE -> QueueView(white)
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                // Mimo's Anton headline: the one brand touch on this dark screen
                Text(title.uppercase(), style = MimoType.display.copy(fontSize = 30.sp, lineHeight = 31.sp), color = white, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(t.artist, style = MimoType.body.copy(fontSize = 15.sp), color = white.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.clickable(enabled = t.artistId.isNotEmpty()) { onClose(); nav.go(Screen.ArtistPage(t.artistId, t.artist)) })
            }
            val liked = lib.isLiked(t.id)
            IconBtn(if (liked) "heart" else "heartOutline", "Love", { app.library.update { it.toggleLike(t) } }, tint = if (liked) Mimo.colors.accent else white, size = 24.dp)
            Box {
                IconBtn("more", "More options", { menu = true }, tint = white)
                TrackMenu(t, menu, { menu = false }, extras = { close -> SleepItems(close) })
            }
        }

        // no playable song (no key / not found / blocked): a dim, untouchable bar with no fake 0:00
        val idle = p.error != null || !hasKey || p.durationMs <= 0
        val dur = p.durationMs.coerceAtLeast(1)
        Slider(
            value = if (idle) 0f else dragging ?: (pos.toFloat() / dur).coerceIn(0f, 1f),
            onValueChange = { dragging = it },
            onValueChangeFinished = { dragging?.let { p.seekTo((it * dur).toLong()) }; dragging = null },
            enabled = !idle,
            colors = SliderDefaults.colors(
                thumbColor = white, activeTrackColor = white, inactiveTrackColor = white.copy(alpha = 0.25f),
                disabledThumbColor = Color.Transparent, disabledActiveTrackColor = white.copy(alpha = 0.2f), disabledInactiveTrackColor = white.copy(alpha = 0.12f),
            ),
            thumb = { if (!idle) Box(Modifier.size(14.dp).background(white, CircleShape)) },
            modifier = Modifier.padding(top = 6.dp).graphicsLayer { alpha = if (idle) 0.5f else 1f },
        )
        Row {
            Text(if (idle) "--:--" else fmt(dragging?.let { (it * dur).toLong() } ?: pos), style = MimoType.eyebrow, color = white.copy(alpha = if (idle) 0.3f else 0.6f))
            Spacer(Modifier.weight(1f))
            Text(if (idle) "--:--" else "-" + fmt(dur - pos), style = MimoType.eyebrow, color = white.copy(alpha = if (idle) 0.3f else 0.6f))
        }
        // one slim line instead of a box, so the controls don't jump down
        if (!hasKey) Text(
            "Add YouTube key to play full songs →", style = MimoType.body.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium), color = white.copy(alpha = 0.85f), maxLines = 1,
            modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp).clip(RoundedCornerShape(999.dp)).background(white.copy(alpha = 0.1f))
                .clickable { onClose(); nav.go(Screen.Settings) }.padding(horizontal = 12.dp, vertical = 5.dp),
        ) else p.error?.let {
            Text(it, style = MimoType.body.copy(fontSize = 12.sp), color = white.copy(alpha = 0.65f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp))
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

        // bottom row: Lyrics · Up Next (the sleep timer lives in the ⋯ menu)
        Row(Modifier.fillMaxWidth().padding(bottom = 12.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            IconBtn("lyricsBubble", "Lyrics", { view = if (view == View.LYRICS) View.ART else View.LYRICS }, tint = if (view == View.LYRICS) Mimo.colors.accent else white.copy(alpha = 0.75f))
            IconBtn("list", "Up next", { view = if (view == View.QUEUE) View.ART else View.QUEUE }, tint = if (view == View.QUEUE) Mimo.colors.accent else white.copy(alpha = 0.75f))
        }
    }
}

/**
 * Press and pull Now Playing down to close it (Apple Music / BitChord): the sheet follows the finger, shrinking
 * and rounding its corners to show the page and the mini player underneath. Let go past a quarter of the screen
 * (or with a quick flick) and it becomes the mini player straight away; otherwise it springs back.
 * Off while Lyrics / Up Next are open, so their lists scroll normally.
 */
private class PullToClose(val modifier: Modifier)

@Composable
private fun rememberPullToClose(enabled: Boolean, onClose: () -> Unit): PullToClose {
    val scope = rememberCoroutineScope()
    val offset = remember { androidx.compose.animation.core.Animatable(0f) }
    val height = androidx.compose.ui.platform.LocalWindowInfo.current.containerSize.height.toFloat().coerceAtLeast(1f)
    val close by rememberUpdatedState(onClose)
    val mod = Modifier
        .graphicsLayer {
            val dy = offset.value
            val k = (dy / height).coerceIn(0f, 1f)
            translationY = dy
            scaleX = 1f - k * 0.12f
            scaleY = 1f - k * 0.12f
            transformOrigin = androidx.compose.ui.graphics.TransformOrigin(0.5f, 0f)
            shape = RoundedCornerShape(if (dy > 0f) (12f + dy / 6f).coerceAtMost(32f).dp else 0.dp)
            clip = dy > 0f
        }
        .pointerInput(enabled) {
            if (!enabled) return@pointerInput
            val tracker = androidx.compose.ui.input.pointer.util.VelocityTracker()
            detectVerticalDragGestures(
                onDragStart = { tracker.resetTracking() },
                onVerticalDrag = { change, amount ->
                    tracker.addPosition(change.uptimeMillis, change.position)
                    change.consume()
                    // follows the finger 1:1, then gets heavier past half the screen
                    val raw = (offset.value + amount).coerceAtLeast(0f)
                    val next = if (raw < height / 2 || amount < 0) raw else offset.value + amount * 0.5f
                    scope.launch { offset.snapTo(next) }
                },
                onDragEnd = {
                    val speed = tracker.calculateVelocity().y // px per second
                    if (offset.value > height * 0.25f || (speed > 1500f && offset.value > 60f)) {
                        close() // straight to the mini player, no slide-away
                        scope.launch { offset.snapTo(0f) }
                    } else scope.launch { offset.animateTo(0f, tween(320, easing = androidx.compose.animation.core.CubicBezierEasing(0.32f, 0.72f, 0f, 1f))) }
                },
                onDragCancel = { scope.launch { offset.animateTo(0f, tween(320)) } },
            )
        }
    return PullToClose(mod)
}

/** Sleep timer options inside the ⋯ menu, with the time left on the heading. */
@Composable
private fun SleepItems(close: () -> Unit) {
    val app = app()
    val toast = LocalToast.current
    val sleep by app.sleep.collectAsState()
    val c = Mimo.colors
    val on = sleep.at != null || sleep.afterSong
    val left = sleep.at?.let { Math.round((it - System.currentTimeMillis()) / 60_000.0).coerceAtLeast(1) }
    androidx.compose.material3.HorizontalDivider(color = c.line.copy(alpha = 0.3f))
    Text(
        "SLEEP TIMER" + when { sleep.afterSong -> " · END OF SONG"; left != null -> " · ${left}m LEFT"; else -> "" },
        style = MimoType.eyebrow, color = c.accent, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
    )
    @Composable fun opt(label: String, s: SleepTimer, msg: String) = DropdownMenuItem(
        text = { Text(label, style = MimoType.body, color = c.ink) },
        leadingIcon = { Icon("moon", tint = c.accent, size = 20.dp) },
        onClick = { close(); app.sleep.value = s; toast(msg) },
    )
    listOf(15, 30, 45, 60).forEach { m -> opt(if (m == 60) "1 hour" else "$m minutes", SleepTimer(at = System.currentTimeMillis() + m * 60_000L), "Music stops in ${if (m == 60) "1 hour" else "$m minutes"}") }
    opt("End of this song", SleepTimer(afterSong = true), "Music stops after this song")
    if (on) opt("Turn off", SleepTimer(), "Sleep timer off")
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
                        if (i == now && line.spans != null) {
                            @OptIn(ExperimentalLayoutApi::class)
                            FlowRow(modifier = Modifier.fillMaxWidth().clickable { p.seekTo((line.t * 1000).toLong()) }) {
                                line.spans!!.forEach { span ->
                                    val sung = pos >= (span.t * 1000).toLong()
                                    Text(
                                        text = shown(span.text),
                                        color = if (sung) white else white.copy(alpha = 0.35f),
                                        style = style,
                                        modifier = Modifier.animateContentSize(),
                                    )
                                }
                            }
                        } else {
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
