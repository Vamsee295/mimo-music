package com.mimo.music;

import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;
import java.util.ArrayList;
import java.util.List;

/**
 * Android Auto (and other media browsers) connect here. It hands them Mimo's media session, so the car shows
 * the song, artwork and progress and its buttons play / pause / skip, exactly like the lock screen.
 * ponytail: no browsable library in the car yet: Mimo's library lives in the app's web page, which isn't
 * running when the car connects on its own. Start music on the phone; the car then controls it.
 */
public class MimoBrowserService extends MediaBrowserServiceCompat {

    @Override
    public void onCreate() {
        super.onCreate();
        setSessionToken(MimoMediaPlugin.session(this).getSessionToken());
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid, @Nullable Bundle rootHints) {
        // only Android Auto, the system's media controls and Mimo itself may connect; other apps get nothing
        if (!ALLOWED.contains(clientPackageName) && !clientPackageName.equals(getPackageName())
            && clientUid != android.os.Process.SYSTEM_UID) return null;
        return new BrowserRoot("mimo-root", null);
    }

    private static final java.util.Set<String> ALLOWED = new java.util.HashSet<>(java.util.Arrays.asList(
        "com.google.android.projection.gearhead", // Android Auto
        "com.google.android.carassistant",
        "com.android.systemui", // media controls in the notification shade / lock screen
        "com.google.android.googlequicksearchbox" // "Hey Google, pause"
    ));

    @Override
    public void onLoadChildren(@NonNull String parentId, @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        result.sendResult(new ArrayList<>());
    }
}
