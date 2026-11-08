package com.mimo.music;

import android.content.Context;
import android.os.Build;
import android.webkit.WebView;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * Mimo's WebView: always tells the page it is visible, even when the screen locks or the app is in the
 * background. Otherwise the page reports "hidden" and the YouTube player pauses itself, so music stops
 * with the screen. (Personal-use APK; this goes against YouTube's terms for a store release.)
 *
 * Screen-off arrives as window visibility GONE (the window manager hides the app's window), and the
 * decor view also turns INVISIBLE — so both signals are pinned to VISIBLE. When the activity is really
 * destroyed the WebView is destroyed with it, so nothing keeps running after the app is closed.
 * Used via res/layout/capacitor_bridge_layout_main.xml, which overrides Capacitor's own layout.
 */
public class BackgroundWebView extends CapacitorWebView {

    public BackgroundWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
        // The page (and the hidden YouTube player in it) runs in a separate WebView "renderer" process. Keep it
        // at the app's own priority with the screen off — otherwise Android may move it to the slow background
        // CPU cores and the audio stutters while the phone sleeps.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(View.VISIBLE);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, View.VISIBLE);
    }
}
