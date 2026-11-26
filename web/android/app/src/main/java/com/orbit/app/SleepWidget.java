package com.orbit.app;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Sleep: last night, and the last seven nights as bars. */
public class SleepWidget extends WidgetBase {
    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_sleep);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open/sleep", 7103));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "sleep", R.string.w_sleep));
        JSONObject s = d == null ? null : d.optJSONObject("sleep");
        if (s == null) {
            v.setTextViewText(R.id.w_value, "—");
            v.setTextViewText(R.id.w_caption, c.getString(R.string.w_open));
            return v;
        }
        // "Last night" is only last night on the day the app wrote it.
        String last = Widgets.fresh(d) && !s.isNull("last") ? s.optString("last") : null;
        String quality = s.isNull("quality") ? null : s.optString("quality");
        v.setTextViewText(R.id.w_value, last != null ? last : "—");
        String line = last != null
            ? Widgets.t(d, "lastNight") + (quality != null ? " · " + quality : "")
            : (Widgets.fresh(d) ? Widgets.t(d, "noSleep") : Widgets.t(d, "stale"));
        v.setTextViewText(R.id.w_caption, line);
        v.setImageViewBitmap(R.id.w_chart, Widgets.bars(c, w - 32, Math.max(40, h - 112), Widgets.series(s, "series"), Widgets.labels(s, "labels"),
            color(c, R.color.w_sleep), color(c, R.color.w_track), color(c, R.color.w_text3), d.optBoolean("rtl")));
        v.setContentDescription(android.R.id.background, Widgets.t(d, "sleep") + ": " + (last != null ? last + ", " : "") + line + ". " + s.optString("avg"));
        return v;
    }
}
