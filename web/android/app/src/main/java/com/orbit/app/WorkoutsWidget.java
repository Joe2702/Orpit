package com.orbit.app;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Training: minutes this week, and each of the last seven days as a bar. */
public class WorkoutsWidget extends WidgetBase {
    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_training);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open/workouts", 7104));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "training", R.string.w_training));
        JSONObject s = d == null ? null : d.optJSONObject("training");
        if (s == null) {
            v.setTextViewText(R.id.w_value, "—");
            v.setTextViewText(R.id.w_caption, c.getString(R.string.w_open));
            return v;
        }
        v.setTextViewText(R.id.w_value, s.optString("total"));
        v.setTextViewText(R.id.w_caption, s.optString("sessions"));
        v.setImageViewBitmap(R.id.w_chart, Widgets.bars(c, w - 32, Math.max(40, h - 112), Widgets.series(s, "series"), Widgets.labels(s, "labels"),
            color(c, R.color.w_train), color(c, R.color.w_track), color(c, R.color.w_text3), d.optBoolean("rtl")));
        v.setContentDescription(android.R.id.background, Widgets.t(d, "training") + ": " + s.optString("total") + ", " + s.optString("sessions"));
        return v;
    }
}
