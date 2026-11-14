package com.mimo.app.ui

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.staticCompositionLocalOf
import com.mimo.app.data.Album
import com.mimo.app.data.Mood

/** Every page in the app. Tabs are roots; the rest stack on top of the current tab. */
sealed interface Screen {
    data object Home : Screen
    data object New : Screen
    data object Library : Screen
    data object Search : Screen
    data class AlbumPage(val id: String, val preview: Album? = null) : Screen
    data class ArtistPage(val id: String, val name: String = "") : Screen
    data class PlaylistPage(val id: String) : Screen
    data class GenrePage(val id: Int, val name: String) : Screen
    data class MoodPage(val mood: Mood) : Screen
    data object Liked : Screen
    data object Recent : Screen
    data object Replay : Screen
    data object Settings : Screen
}

val TABS = listOf(Screen.Home, Screen.New, Screen.Library, Screen.Search)

/** A tiny back stack: no navigation library needed for one level of tabs plus pushed pages. */
class Navigator {
    val stack = mutableStateListOf<Screen>(Screen.Home)
    val top: Screen get() = stack.last()
    val tab: Screen get() = stack.first()

    fun go(s: Screen) { if (top != s) stack.add(s) }
    fun back(): Boolean = if (stack.size > 1) { stack.removeAt(stack.lastIndex); true } else false
    /** Tapping a tab (even the current one) goes to its root, like every music app. */
    fun selectTab(t: Screen) { stack.clear(); stack.add(t) }
}

val LocalNav = staticCompositionLocalOf<Navigator> { error("no navigator") }
