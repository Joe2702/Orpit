package com.orbit.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

/**
 * Home-screen widget: today's habit progress plus three one-tap log actions.
 *
 * Data comes from the SharedPreferences file the Capacitor Preferences plugin
 * writes to ("CapacitorStorage"), so the web layer stays the single source of
 * truth and this class never talks to the network or the database. The app
 * refreshes the summary whenever it goes to the background — see
 * MainActivity.onPause — which is the moment the numbers are freshest and the
 * user is most likely about to look at their home screen.
 */
public class OrbitWidget extends AppWidgetProvider {

    /** Matches the plugin's default group name. */
    private static final String STORE = "CapacitorStorage";
    /** Written by the web layer; see web/src/lib/widget.ts. */
    private static final String KEY_SUMMARY = "widget_summary";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, buildViews(context));
        }
    }

    /** Re-render every placed instance. Called from the activity on pause. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName me = new ComponentName(context, OrbitWidget.class);
        int[] ids = manager.getAppWidgetIds(me);
        if (ids == null || ids.length == 0) return;
        RemoteViews views = buildViews(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private static RemoteViews buildViews(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_orbit);

        SharedPreferences prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        String summary = prefs.getString(KEY_SUMMARY, null);
        // Anything unreadable falls back to the placeholder rather than showing
        // a stale or broken value — the actions below still work regardless.
        if (summary == null || summary.length() == 0 || summary.length() > 40) {
            summary = context.getString(R.string.widget_no_data);
        }
        views.setTextViewText(R.id.widget_summary, summary);

        // Header opens the app normally; each action deep-links to a sheet using
        // the same orbit:// URLs the launcher shortcuts use.
        views.setOnClickPendingIntent(R.id.widget_header, open(context, "orbit://open", 0));
        views.setOnClickPendingIntent(R.id.widget_workout, open(context, "orbit://log/workout", 1));
        views.setOnClickPendingIntent(R.id.widget_sleep, open(context, "orbit://log/sleep", 2));
        views.setOnClickPendingIntent(R.id.widget_expense, open(context, "orbit://log/expense", 3));
        return views;
    }

    private static PendingIntent open(Context context, String url, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Distinct request codes, or the platform reuses one PendingIntent for
        // every button and all three would open the same screen.
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
