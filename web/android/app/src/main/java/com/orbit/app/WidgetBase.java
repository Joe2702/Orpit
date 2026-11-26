package com.orbit.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * One home-screen widget. Each kind is its own provider, so each is its own
 * entry in the widget picker; this draws a placed one at the size it's been
 * given, and again whenever it's resized.
 */
public abstract class WidgetBase extends AppWidgetProvider {

    /** The picture for one placed widget, [w]×[h] dp, from the app's data (null before there is any). */
    abstract RemoteViews build(Context c, JSONObject d, int w, int h);

    /** The size it's most often shown at, until the launcher says. */
    int defaultWidth() {
        return 160;
    }

    int defaultHeight() {
        return 160;
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) update(c, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle options) {
        update(c, m, id);
    }

    void update(Context c, AppWidgetManager m, int id) {
        try {
            Bundle o = m.getAppWidgetOptions(id);
            // Upright, a widget is its minimum width wide and its maximum height tall.
            int w = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
            int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
            m.updateAppWidget(id, build(c, Widgets.data(c), w > 0 ? w : defaultWidth(), h > 0 ? h : defaultHeight()));
        } catch (Exception ignored) {
            // Keep the last picture rather than show a broken one.
        }
    }

    static int color(Context c, int res) {
        return c.getColor(res);
    }
}
