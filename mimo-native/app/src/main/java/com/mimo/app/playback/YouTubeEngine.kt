package com.mimo.app.playback

import android.annotation.SuppressLint
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView

/**
 * YouTube's official IFrame Player API in a headless WebView. Same approach as the Capacitor app
 * (lib/youtube.ts + BackgroundWebView.java), minus the rest of the web app around it.
 *
 * The player is kept at YouTube's 200x200 minimum: YouTube picks stream quality from the player size,
 * so a tiny player means the lowest video quality and the least data. Callbacks arrive on the main thread.
 */
@SuppressLint("SetJavaScriptEnabled", "ViewConstructor")
class YouTubeEngine(context: Context, private val listener: Listener) {

    interface Listener {
        fun onReady()
        /** YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued */
        fun onState(state: Int)
        fun onTime(positionMs: Long, durationMs: Long)
        /** 2 bad id, 5 HTML5 error, 100 removed/private, 101/150 owner blocks embedding */
        fun onError(code: Int)
    }

    private val main = Handler(Looper.getMainLooper())
    private var ready = false
    private val pending = ArrayList<String>() // calls made before the API finished loading

    private val web = object : WebView(context.applicationContext) {
        // Never attached to a window: pin visibility so Chromium doesn't treat the page as hidden and pause it.
        override fun onWindowVisibilityChanged(visibility: Int) = super.onWindowVisibilityChanged(View.VISIBLE)
        override fun onVisibilityChanged(changedView: View, visibility: Int) = super.onVisibilityChanged(changedView, View.VISIBLE)
    }.apply {
        settings.javaScriptEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.domStorageEnabled = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        val px = (200 * resources.displayMetrics.density).toInt()
        measure(View.MeasureSpec.makeMeasureSpec(px, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(px, View.MeasureSpec.EXACTLY))
        layout(0, 0, px, px)
        addJavascriptInterface(Bridge(), "Mimo")
        // https://localhost origin, like the Capacitor app: YouTube rejects embeds it can't verify (errors 152/153)
        loadDataWithBaseURL("https://localhost/", HTML, "text/html", "utf-8", null)
    }

    private val poll = object : Runnable {
        override fun run() {
            if (ready) web.evaluateJavascript("[player.getCurrentTime(),player.getDuration()]") { v ->
                val p = v?.trim('[', ']')?.split(',')?.mapNotNull { it.toDoubleOrNull() }
                if (p != null && p.size == 2) listener.onTime((p[0] * 1000).toLong(), (p[1] * 1000).toLong())
            }
            main.postDelayed(this, 500)
        }
    }.also { main.post(it) }

    fun load(videoId: String, startMs: Long, autoplay: Boolean) {
        require(ID.matches(videoId)) { "not a YouTube video id: $videoId" } // it's spliced into JS below
        val fn = if (autoplay) "loadVideoById" else "cueVideoById"
        call("player.$fn({videoId:'$videoId',startSeconds:${startMs / 1000.0}})")
    }
    fun play() = call("player.playVideo()")
    fun pause() = call("player.pauseVideo()")
    fun seek(ms: Long) = call("player.seekTo(${ms / 1000.0},true)")
    fun stop() = call("player.stopVideo()")

    fun destroy() {
        main.removeCallbacks(poll)
        web.destroy()
    }

    private fun call(js: String) {
        if (ready) web.evaluateJavascript(js, null) else pending += js
    }

    private inner class Bridge {
        @JavascriptInterface fun ready() = main.post {
            ready = true
            pending.forEach { web.evaluateJavascript(it, null) }
            pending.clear()
            listener.onReady()
        }
        @JavascriptInterface fun state(s: Int) { main.post { listener.onState(s) } }
        @JavascriptInterface fun error(c: Int) { main.post { listener.onError(c) } }
    }

    private companion object {
        val ID = Regex("^[A-Za-z0-9_-]{11}$")
        val HTML = """
            <!doctype html><html><head><meta name="viewport" content="width=device-width"></head>
            <body style="margin:0;background:#000"><div id="p"></div>
            <script>
            var player;
            function onYouTubeIframeAPIReady() {
              player = new YT.Player('p', {
                width: 200, height: 200,
                playerVars: { playsinline: 1, rel: 0, controls: 0, origin: location.origin },
                events: {
                  onReady: function () { Mimo.ready(); },
                  onStateChange: function (e) { Mimo.state(e.data); },
                  onError: function (e) { Mimo.error(e.data); }
                }
              });
            }
            </script>
            <script src="https://www.youtube.com/iframe_api"></script>
            </body></html>
        """.trimIndent()
    }
}
