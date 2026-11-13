package com.mimo.music;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.widget.RemoteViews;

/**
 * Home-screen widget: the current song's cover, title and artist with ⏮ ⏯ ⏭. MimoMediaPlugin refreshes it
 * whenever the song or play state changes; the buttons go through MimoActionReceiver like the notification's.
 * While Mimo isn't running, the whole widget (play button included) just opens the app.
 */
public class MimoWidget extends AppWidgetProvider {

    // last known state, so a widget added (or redrawn) later shows the right song
    private static String title = "Mimo", artist = "Tap to start music";
    private static boolean playing = false, alive = false;
    private static Bitmap art;

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, views(ctx));
    }

    /** Called by MimoMediaPlugin; cheap no-op when no widget is placed. */
    static void refresh(Context ctx, String t, String a, boolean isPlaying, Bitmap cover, boolean running) {
        title = t == null || t.isEmpty() ? "Mimo" : t;
        artist = a == null ? "" : a;
        playing = isPlaying;
        alive = running;
        if (cover != null) art = scaled(cover);
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, MimoWidget.class));
        if (ids.length == 0) return;
        RemoteViews v = views(ctx);
        for (int id : ids) mgr.updateAppWidget(id, v);
    }

    // a widget update is limited in size: keep the cover small
    private static Bitmap scaled(Bitmap b) {
        int max = 200;
        if (b.getWidth() <= max && b.getHeight() <= max) return b;
        float k = (float) max / Math.max(b.getWidth(), b.getHeight());
        return Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * k), Math.round(b.getHeight() * k), true);
    }

    private static RemoteViews views(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.mimo_widget);
        v.setTextViewText(R.id.widget_title, title);
        v.setTextViewText(R.id.widget_artist, artist);
        if (art != null) v.setImageViewBitmap(R.id.widget_art, art);
        v.setImageViewResource(R.id.widget_toggle, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent open = launch == null ? null : PendingIntent.getActivity(ctx, 10, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.widget_root, open);
        if (alive) {
            v.setOnClickPendingIntent(R.id.widget_prev, button(ctx, MimoMediaPlugin.ACTION_PREV, 11));
            v.setOnClickPendingIntent(R.id.widget_toggle, button(ctx, MimoMediaPlugin.ACTION_TOGGLE, 12));
            v.setOnClickPendingIntent(R.id.widget_next, button(ctx, MimoMediaPlugin.ACTION_NEXT, 13));
        } else {
            v.setOnClickPendingIntent(R.id.widget_prev, open);
            v.setOnClickPendingIntent(R.id.widget_toggle, open);
            v.setOnClickPendingIntent(R.id.widget_next, open);
        }
        return v;
    }

    private static PendingIntent button(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, MimoActionReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
