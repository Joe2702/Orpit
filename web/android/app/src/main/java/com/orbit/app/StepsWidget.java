package com.orbit.app;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Steps: today's count inside a ring that fills toward the goal, and turns green at it. */
public class StepsWidget extends WidgetBase {
    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_steps);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open/steps", 7101));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "steps", R.string.w_steps));
        int ring = Math.max(64, Math.min(Math.min(w, h - 64), 170));
        JSONObject s = d == null ? null : d.optJSONObject("steps");
        if (s == null) {
            v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, ring, 0f, color(c, R.color.w_accent), color(c, R.color.w_track)));
            v.setTextViewText(R.id.w_value, "—");
            v.setTextViewText(R.id.w_sub, "");
            v.setTextViewText(R.id.w_caption, c.getString(R.string.w_open));
            return v;
        }
        long goal = Math.max(1, s.optLong("goal", 8000));
        long count = Widgets.steps(c, d);
        boolean reached = count >= goal;
        int col = color(c, reached ? R.color.w_good : R.color.w_accent);
        v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, ring, count / (float) goal, col, color(c, R.color.w_track)));
        v.setTextViewText(R.id.w_value, Widgets.num(d, count));
        v.setTextViewText(R.id.w_sub, s.optString("goalText"));
        String line = reached ? Widgets.t(d, "reached") : Widgets.t(d, "toGo").replace("{n}", Widgets.num(d, goal - count));
        v.setTextViewText(R.id.w_caption, line);
        v.setTextColor(R.id.w_caption, reached ? col : color(c, R.color.w_text2));
        v.setContentDescription(android.R.id.background, Widgets.t(d, "steps") + ": " + Widgets.num(d, count) + " " + s.optString("goalText") + ". " + line);
        return v;
    }
}
