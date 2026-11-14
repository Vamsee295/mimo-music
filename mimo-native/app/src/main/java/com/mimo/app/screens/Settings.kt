package com.mimo.app.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.mimo.app.data.*
import com.mimo.app.ui.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

// Settings + Account (app/settings, app/account) and Replay (app/replay).

@Composable
private fun Toggle(label: String, sub: String? = null, on: Boolean, onChange: (Boolean) -> Unit) {
    val c = Mimo.colors
    Row(Modifier.fillMaxWidth().clickable { onChange(!on) }.padding(horizontal = 20.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MimoType.body, color = c.ink)
            if (sub != null) Text(sub, style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f))
        }
        // editorial switch: outlined pill, ink knob
        Box(Modifier.width(52.dp).height(30.dp).clip(RoundedCornerShape(999.dp)).background(if (on) c.accent else c.card2).border(2.dp, c.line, RoundedCornerShape(999.dp)).padding(4.dp),
            contentAlignment = if (on) Alignment.CenterEnd else Alignment.CenterStart) {
            Box(Modifier.size(20.dp).background(if (on) c.paper else c.ink, CircleShape))
        }
    }
}

@Composable
private fun Choice(options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit) =
    LazyRow(contentPadding = PaddingValues(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        items(options) { (value, label) -> Pill(label, { onPick(value) }, filled = value == selected) }
    }

@Composable
fun SettingsScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    val nav = LocalNav.current
    val toast = LocalToast.current
    val c = Mimo.colors
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val s = lib.settings
    fun set(fn: (Settings) -> Settings) = app.library.update { it.copy(settings = fn(it.settings)) }
    var name by remember { mutableStateOf(lib.name) }
    var key by remember { mutableStateOf(lib.ytKey) }
    var keyStatus by remember { mutableStateOf<String?>(null) }
    var confirmClear by remember { mutableStateOf(false) }

    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val ok = runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openOutputStream(uri)!!.use { it.write(makeBackup(app.library.value).toByteArray()) } } }.isSuccess
            toast(if (ok) "Library saved" else "Couldn't save the file")
        }
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val r = runCatching { withContext(Dispatchers.IO) { readBackup(ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes().decodeToString() }) } }
            r.onSuccess { b -> app.library.update { it.restore(b) }; name = b.name; toast("Library restored: ${b.liked.size} liked, ${b.playlists.size} playlists") }
                .onFailure { toast(it.message ?: "Couldn't read that file") }
        }
    }

    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item { PageHeader("Settings", eyebrow = "Account & app", note = "everything stays on this phone") }

        section(1, "You", "Account")
        item {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field(name, { name = it.take(40); app.library.update { l -> l.copy(name = name.trim()) } }, "Your name (for the greeting)", leading = "user")
                val month = lib.listening[monthKey()]
                Text("${lib.liked.size} liked · ${lib.songs.size} in library · ${lib.playlists.size} playlists · ${Math.round((month?.seconds ?: 0.0) / 60)} min this month",
                    style = MimoType.body.copy(fontSize = 13.sp), color = c.ink.copy(alpha = 0.6f))
                Pill("Your Replay", { nav.go(Screen.Replay) }, icon = "radio", filled = false)
            }
        }

        section(2, "Full songs", "YouTube Key")
        item {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Mimo finds each song on YouTube with your own free YouTube Data API key (Google Cloud → APIs → YouTube Data API v3 → Credentials). Each new song costs about 101 of the 10,000 free daily units; songs you've played before cost nothing.",
                    style = MimoType.body.copy(fontSize = 13.sp), color = c.ink.copy(alpha = 0.7f))
                Field(key, { key = it; keyStatus = null }, "AIza…", leading = "settings")
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Pill("Test & save", {
                        val k = cleanKey(key)
                        key = k
                        if (!looksLikeKey(k)) { keyStatus = "That doesn't look like a key: it starts with AIza and is 39 characters."; return@Pill }
                        scope.launch {
                            keyStatus = "Testing…"
                            val err = app.youtube.testKey(k)
                            keyStatus = err ?: "Works! Saved.".also { app.library.update { l -> l.copy(ytKey = k) } }
                        }
                    }, accent = true)
                    if (lib.ytKey.isNotEmpty()) Text("✓ key saved", style = MimoType.note, color = c.note)
                }
                keyStatus?.let { Text(it, style = MimoType.body.copy(fontSize = 13.sp), color = c.accent) }
            }
        }

        section(3, "Look", "Theme")
        item { Choice(listOf("editorial" to "Paper", "dark" to "Night", "system" to "Phone"), if (s.themeSystem) "system" else s.theme) { v ->
            set { if (v == "system") it.copy(themeSystem = true) else it.copy(theme = v, themeSystem = false) }
        } }
        item {
            val accents = listOf("#c8603a", "#2f6f6a", "#3b5bdb", "#b5179e", "#e0a800", "#191614")
            Row(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                accents.forEach { hex ->
                    val col = parseAccent(hex)!!
                    Box(Modifier.size(36.dp).clip(CircleShape).background(col).border(if (s.accent == hex) 3.dp else 2.dp, if (s.accent == hex) c.ink else c.line, CircleShape)
                        .clickable { set { it.copy(accent = hex) } })
                }
            }
        }

        section(4, "Listening", "Playback")
        item { Toggle("Autoplay", "Keep playing similar songs when your queue ends", s.autoplay) { v -> set { it.copy(autoplay = v) } } }
        item { Toggle("Fresh Autoplay", "Never suggest a song Autoplay already played today", s.noRepeatAutoplay) { v -> set { it.copy(noRepeatAutoplay = v) } } }
        item { Toggle("Synced lyrics", "Lyrics follow the song", s.syncedLyrics) { v -> set { it.copy(syncedLyrics = v) } } }
        item { Toggle("Explicit songs", null, s.explicit) { v -> set { it.copy(explicit = v) } } }
        item {
            Text("Store", style = MimoType.body, color = c.ink, modifier = Modifier.padding(start = 20.dp, top = 10.dp))
            Choice(listOf("in" to "India", "us" to "US", "gb" to "UK", "ca" to "Canada", "au" to "Australia", "ae" to "UAE", "sg" to "Singapore"), s.country) { v -> set { it.copy(country = v) } }
        }

        section(5, "Home", "Home Sections")
        item { Toggle("Made for you", null, s.homeMadeForYou) { v -> set { it.copy(homeMadeForYou = v) } } }
        item { Toggle("Recently played", null, s.homeRecent) { v -> set { it.copy(homeRecent = v) } } }
        item { Toggle("Featured artists", null, s.homeFeatured) { v -> set { it.copy(homeFeatured = v) } } }
        item { Toggle("Study & Sleep", null, s.homeMoods) { v -> set { it.copy(homeMoods = v) } } }
        item { Toggle("Top songs", null, s.homeCharts) { v -> set { it.copy(homeCharts = v) } } }
        item { Toggle("Genre mixes", null, s.homeGenres) { v -> set { it.copy(homeGenres = v) } } }

        section(6, "Your data", "Backup")
        item {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("There's no account, so this file is how you move your library to a new phone. It works with backups from the old Mimo app too. Your API key is never put in it.",
                    style = MimoType.body.copy(fontSize = 13.sp), color = c.ink.copy(alpha = 0.7f))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Pill("Export", { export.launch("mimo-library.json") }, icon = "upload")
                    Pill("Import", { import.launch(arrayOf("application/json", "text/plain", "*/*")) }, icon = "down", filled = false)
                }
                Pill("Clear listening history", { confirmClear = true }, filled = false, icon = "trash")
            }
        }
        item {
            Text("Mimo 1.0 · native · catalogue by Apple, songs by YouTube's official player, lyrics by LRCLIB",
                style = MimoType.eyebrow.copy(fontSize = 10.sp), color = c.ink.copy(alpha = 0.4f), modifier = Modifier.padding(20.dp))
        }
    }
    if (confirmClear) Dialog({ confirmClear = false }) {
        Column(Modifier.fillMaxWidth().brut(c).padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Clear your history, Replay stats and what Autoplay has learned? Liked songs and playlists stay.", style = MimoType.body, color = c.ink)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Pill("Clear", { confirmClear = false; app.library.update { it.clearHistory() }; toast("History cleared") }, accent = true)
                Pill("Cancel", { confirmClear = false }, filled = false)
            }
        }
    }
}

@Composable
fun ReplayScreen() {
    val app = app()
    val lib by app.library.state.collectAsState()
    val p = LocalPlayer.current
    val nav = LocalNav.current
    val c = Mimo.colors
    var range by remember { mutableStateOf(Range.MONTH) }
    val r = remember(lib.playLog, range) { replay(lib.playLog, lib.playMeta, range.days?.let { dayOf() - it + 1 } ?: Int.MIN_VALUE) }
    LazyColumn(contentPadding = PaddingValues(bottom = BottomGap)) {
        item { BackBar() }
        item { PageHeader("Replay", eyebrow = "Your listening", note = "counted when you play 30s or more") }
        item { Choice(Range.entries.map { it.name to it.label }, range.name) { range = Range.valueOf(it) } }
        item {
            Row(Modifier.padding(20.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                listOf("${r.minutes}" to "minutes", "${r.plays}" to "plays", "${r.artists.size}" to "artists").forEach { (v, l) ->
                    Column(Modifier.weight(1f).brut(c).padding(14.dp)) {
                        Text(v, style = MimoType.display.copy(fontSize = 32.sp), color = c.accent)
                        Text(l.uppercase(), style = MimoType.label.copy(fontSize = 12.sp), color = c.ink)
                    }
                }
            }
        }
        if (r.plays == 0) item { Loading("Play some songs and your top lists show up here.") }
        if (r.songs.isNotEmpty()) {
            section(1, "Most played", "Top Songs")
            item { PlayShuffle(r.songs.take(50).map { it.track }) }
            itemsIndexed(r.songs.take(20), key = { _, s -> s.track.id }) { i, s ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("%02d".format(i + 1), style = MimoType.display.copy(fontSize = 22.sp), color = c.accent, modifier = Modifier.padding(start = 20.dp).width(36.dp))
                    Box(Modifier.weight(1f)) { TrackRow(s.track, { p.playList(r.songs.map { it.track }, i) }) }
                    Text("${s.n}×", style = MimoType.eyebrow, color = c.ink.copy(alpha = 0.5f), modifier = Modifier.padding(end = 20.dp))
                }
            }
        }
        if (r.artists.isNotEmpty()) {
            section(2, "Most played", "Top Artists")
            itemsIndexed(r.artists.take(10), key = { _, a -> a.name }) { i, a ->
                val id = lib.playMeta.values.firstOrNull { mainArtist(it.artist) == a.name && it.artistId.isNotEmpty() }?.artistId
                Row(Modifier.fillMaxWidth().clickable(enabled = id != null) { nav.go(Screen.ArtistPage(id!!, a.name)) }.padding(horizontal = 20.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    Text("%02d".format(i + 1), style = MimoType.display.copy(fontSize = 22.sp), color = c.accent, modifier = Modifier.width(36.dp))
                    ArtistAvatar(a.name, 48.dp)
                    Column(Modifier.weight(1f).padding(start = 12.dp)) {
                        Text(a.name, style = MimoType.body, color = c.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${a.n} plays · ${a.minutes} min", style = MimoType.body.copy(fontSize = 12.sp), color = c.ink.copy(alpha = 0.6f))
                    }
                }
            }
        }
    }
}
