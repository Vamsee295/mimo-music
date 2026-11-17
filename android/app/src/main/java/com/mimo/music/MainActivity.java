package com.mimo.music;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MimoMediaPlugin.class); // "Now playing" notification + lock-screen controls
        super.onCreate(savedInstanceState);
        // Android 13+: ask once to show the "Now playing" notification (music plays either way)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 1);
        }

        // The page runs in a separate WebView process that Android may kill (low memory, or it crashed). Left
        // unhandled, that takes the whole app down and the music stops until you reopen Mimo. Handled here: the
        // screen is rebuilt with a fresh WebView, and the page carries on the song it was playing (PlayerBar
        // "resumeAfterCrash": position + "was playing" are saved every few seconds).
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.w("Mimo", "WebView page process gone (crashed: " + (Build.VERSION.SDK_INT >= 26 && detail.didCrash()) + "), reloading");
                runOnUiThread(MainActivity.this::recreate);
                return true; // handled: keep the app alive
            }
        });
    }
}
