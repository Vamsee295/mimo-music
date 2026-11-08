package com.mimo.music;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** ⏮ ⏯ ⏭ taps on the notification (explicit, app-internal broadcasts) → MimoMediaPlugin → the web player. */
public class MimoActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        MimoMediaPlugin.onNotificationButton(intent.getAction());
    }
}
