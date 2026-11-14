package com.mimo.app.data

import android.content.Context
import java.io.File

/** The app's long-lived pieces, created once per process (the activity and the playback service share them). */
class App private constructor(context: Context) {
    val library = LibraryStore.get(context)
    val catalog = Catalog(country = { library.value.settings.country }, explicit = { library.value.settings.explicit })
    val youtube = YouTubeSearch(VideoCache(File(context.filesDir, "yt-ids.json"))) { library.value.ytKey }
    val extras = Extras()
    /** Sleep timer, shared by the screens (set it) and the playback service (acts on it). Same process, so no IPC. */
    val sleep = kotlinx.coroutines.flow.MutableStateFlow(com.mimo.app.playback.SleepTimer())

    companion object {
        @Volatile private var instance: App? = null
        fun get(context: Context) = instance ?: synchronized(this) { instance ?: App(context.applicationContext).also { instance = it } }
    }
}
