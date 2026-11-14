# The YouTube page calls these from JavaScript (playback/YouTubeEngine.kt); R8 must keep their names.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
