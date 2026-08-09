package com.orbit.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

/**
 * Shared renderer for the analytics widgets.
 *
 * Each module gets its own widget so the user can place whichever ones they
 * care about, rather than one widget with a configuration screen to wade
 * through. Android needs a distinct provider class per entry in the picker, so
 * the subclasses below are deliberately trivial: everything except "which key
 * do I read and where do I open" lives here.
 *
 * This class never computes anything. The web layer writes a pre-formatted
 * payload (see web/src/lib/widgetStats.ts) and this splits it into the layout,
 * so the numbers, the rounding and the currency can never drift from what the
 * app itself shows.
 */
public abstract class StatsWidget extends AppWidgetProvider {

    /** Matches the Capacitor Preferences plugin's default group name. */
    private static final String STORE = "CapacitorStorage";

    /**
     * ASCII unit separator (31), the delimiter the web side writes.
     *
     * Built from a char rather than written as an escape: Java resolves unicode
     * escapes before it parses the file, so an escaped control character in a
     * literal is a needless trap. As a regex for split() it has no special
     * meaning, which is the other reason this character was chosen.
     */
    private static final String SEP = String.valueOf((char) 31);

    /** Fields in the payload: title, value, caption, then three label/value pairs. */
    private static final int FIELDS = 9;

    /** Preferences key holding this widget's payload. */
    protected abstract String key();

    /** Deep link opened when the widget is tapped. */
    protected abstract String link();

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) {
            manager.updateAppWidget(id, build(context));
        }
    }

    /** Re-render every placed instance of this provider. */
    void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, getClass()));
        if (ids == null || ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) {
            manager.updateAppWidget(id, views);
        }
    }

    private RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_stats);

        SharedPreferences prefs = context.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        String raw = prefs.getString(key(), null);

        // -1 keeps trailing empty fields, which split() would otherwise discard
        // and leave the array short — a panel whose last rows are empty is the
        // normal case, not an error.
        String[] f = raw == null ? new String[0] : raw.split(SEP, -1);

        if (f.length < FIELDS) {
            // Nothing written yet, or a payload from a newer app than this
            // widget understands. Show the placeholder rather than fragments.
            views.setTextViewText(R.id.stat_title, context.getString(R.string.app_name));
            views.setTextViewText(R.id.stat_value, context.getString(R.string.widget_no_data));
            views.setTextViewText(R.id.stat_caption, "");
            views.setViewVisibility(R.id.stat_row1, View.GONE);
            views.setViewVisibility(R.id.stat_row2, View.GONE);
            views.setViewVisibility(R.id.stat_row3, View.GONE);
        } else {
            views.setTextViewText(R.id.stat_title, f[0]);
            views.setTextViewText(R.id.stat_value, f[1]);
            views.setTextViewText(R.id.stat_caption, f[2]);
            row(views, R.id.stat_row1, R.id.stat_row1_label, R.id.stat_row1_value, f[3], f[4]);
            row(views, R.id.stat_row2, R.id.stat_row2_label, R.id.stat_row2_value, f[5], f[6]);
            row(views, R.id.stat_row3, R.id.stat_row3_label, R.id.stat_row3_value, f[7], f[8]);
        }

        views.setOnClickPendingIntent(R.id.stat_root, open(context));
        return views;
    }

    private static void row(RemoteViews views, int rowId, int labelId, int valueId, String label, String value) {
        if (label == null || label.length() == 0) {
            views.setViewVisibility(rowId, View.GONE);
            return;
        }
        views.setViewVisibility(rowId, View.VISIBLE);
        views.setTextViewText(labelId, label);
        views.setTextViewText(valueId, value);
    }

    private PendingIntent open(Context context) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(Intent.ACTION_VIEW);
        intent.setData(Uri.parse(link()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // The request code must differ per provider, or the platform hands every
        // widget the same PendingIntent and they all open the same screen.
        return PendingIntent.getActivity(
            context,
            getClass().getName().hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
