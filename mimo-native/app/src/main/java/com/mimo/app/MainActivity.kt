package com.mimo.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mimo.app.data.App
import com.mimo.app.screens.*
import com.mimo.app.ui.*
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1)
        setContent { Root() }
    }
}

@Composable
private fun Root() {
    val ctx = LocalContext.current
    val app = remember { App.get(ctx) }
    val settings by app.library.state.collectAsState().let { s -> derivedStateOf { s.value.settings } }
    val dark = if (settings.themeSystem) isSystemInDarkTheme() else settings.theme == "dark"
    val player = remember { PlayerConnection(ctx) }
    DisposableEffect(Unit) { onDispose { player.release() } }
    val nav = remember { Navigator() }
    var nowPlaying by rememberSaveable { mutableStateOf(false) }
    var toast by remember { mutableStateOf<Pair<String, Long>?>(null) }
    LaunchedEffect(toast) { if (toast != null) { delay(2200); toast = null } }

    // status bar icons follow the app's theme (and Now Playing's dark island), not the phone's
    val activity = ctx as ComponentActivity
    val darkBars = dark || nowPlaying
    LaunchedEffect(darkBars) {
        val clear = android.graphics.Color.TRANSPARENT
        val style = if (darkBars) androidx.activity.SystemBarStyle.dark(clear) else androidx.activity.SystemBarStyle.light(clear, clear)
        activity.enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    MimoTheme(dark = dark, accent = parseAccent(settings.accent)) {
        CompositionLocalProvider(
            LocalPlayer provides player, LocalNav provides nav,
            LocalToast provides { msg: String -> toast = msg to System.nanoTime() },
        ) {
            BackHandler(enabled = nowPlaying || nav.stack.size > 1) { if (nowPlaying) nowPlaying = false else nav.back() }
            val c = Mimo.colors
            Box(Modifier.fillMaxSize().dottedPaper(c)) {
                Column(Modifier.fillMaxSize()) {
                    Box(Modifier.weight(1f).fillMaxWidth().statusBarsPadding()) {
                        AnimatedContent(
                            targetState = nav.top,
                            transitionSpec = { fadeIn(tween(180)) togetherWith fadeOut(tween(120)) },
                            label = "page",
                        ) { screen -> Page(screen) }
                    }
                }
                Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth()) {
                    toast?.let { (msg) ->
                        Text(msg, style = MimoType.label, color = c.paper, modifier = Modifier.align(Alignment.CenterHorizontally)
                            .padding(bottom = 10.dp).background(c.ink, androidx.compose.foundation.shape.RoundedCornerShape(999.dp)).padding(horizontal = 18.dp, vertical = 10.dp))
                    }
                    if (player.current != null) MiniPlayer { nowPlaying = true }
                    TabBar(nav)
                }
                AnimatedVisibility(
                    nowPlaying && player.current != null,
                    enter = slideInVertically(tween(320)) { it } + fadeIn(),
                    exit = slideOutVertically(tween(260)) { it } + fadeOut(),
                ) { NowPlaying(onClose = { nowPlaying = false }) }
            }
        }
    }
}

@Composable
private fun Page(s: Screen) = when (s) {
    Screen.Home -> HomeScreen()
    Screen.New -> NewScreen()
    Screen.Library -> LibraryScreen()
    Screen.Search -> SearchScreen()
    is Screen.AlbumPage -> AlbumScreen(s.id, s.preview)
    is Screen.ArtistPage -> ArtistScreen(s.id, s.name)
    is Screen.PlaylistPage -> PlaylistScreen(s.id)
    is Screen.GenrePage -> GenreScreen(s.id, s.name)
    is Screen.MoodPage -> MoodScreen(s.mood)
    Screen.Liked -> LikedScreen()
    Screen.Recent -> RecentScreen()
    Screen.Replay -> ReplayScreen()
    Screen.Settings -> SettingsScreen()
}

private val tabIcons = mapOf(Screen.Home to ("Home" to "home"), Screen.New to ("New" to "grid"), Screen.Library to ("Library" to "library"), Screen.Search to ("Search" to "search"))

@Composable
private fun TabBar(nav: Navigator) {
    val c = Mimo.colors
    Row(
        Modifier.fillMaxWidth().background(c.paper.copy(alpha = 0.97f))
            .drawBehind { drawLine(c.line, Offset(0f, 0f), Offset(size.width, 0f), 2.4.dp.toPx()) }
            .navigationBarsPadding(),
    ) {
        TABS.forEach { t ->
            val (label, ico) = tabIcons.getValue(t)
            val on = nav.tab == t
            Column(
                Modifier.weight(1f).clickable { nav.selectTab(t) }.padding(top = 8.dp, bottom = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(ico, tint = if (on) c.accent else c.ink.copy(alpha = 0.55f), size = 24.dp)
                Text(label.uppercase(), style = MimoType.label.copy(fontSize = 12.sp), color = if (on) c.accent else c.ink.copy(alpha = 0.55f))
            }
        }
    }
}
