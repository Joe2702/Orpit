package com.orbit.app;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Habits: today's progress as a ring, and, once it's wide enough, today's
 * habits beside it, the ones still to do first.
 */
public class HabitsWidget extends WidgetBase {
    private static final int[] ROWS = {R.id.w_h1, R.id.w_h2, R.id.w_h3, R.id.w_h4};
    private static final int[] ICONS = {R.id.w_h1_icon, R.id.w_h2_icon, R.id.w_h3_icon, R.id.w_h4_icon};
    private static final int[] NAMES = {R.id.w_h1_name, R.id.w_h2_name, R.id.w_h3_name, R.id.w_h4_name};

    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_habits);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open/habits", 7102));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "habits", R.string.w_habits));
        Widgets.Habits hb = Widgets.habits(d);
        int due = hb.due();
        boolean all = due > 0 && hb.doneCount == due;
        int col = color(c, all ? R.color.w_good : R.color.w_accent);
        boolean list = w >= 200 && due > 0;
        int ring = Math.max(56, Math.min(list ? Math.min(w / 2 - 20, h - 70) : Math.min(w, h - 70), 150));
        v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, ring, due == 0 ? 0f : hb.doneCount / (float) due, col, color(c, R.color.w_track)));
        v.setTextViewText(R.id.w_value, due == 0 ? "—" : Widgets.num(d, hb.doneCount) + "/" + Widgets.num(d, due));
        v.setTextViewText(R.id.w_sub, d == null ? "" : Widgets.t(d, "habitsShort"));
        String line = Widgets.habitsLine(c, d, hb);
        v.setTextViewText(R.id.w_caption, line);
        v.setTextColor(R.id.w_caption, all ? col : color(c, R.color.w_text2));
        v.setContentDescription(android.R.id.background, Widgets.t(c, d, "habits", R.string.w_habits) + ": " + line);

        v.setViewVisibility(R.id.w_list, list ? View.VISIBLE : View.GONE);
        if (list) {
            // Still to do first: that's what the widget is for.
            int fits = Math.max(1, Math.min(ROWS.length, (h - 70) / 24));
            int shown = 0;
            for (int pass = 0; pass < 2; pass++) {
                for (int i = 0; i < due && shown < fits; i++) {
                    boolean done = hb.done.get(i);
                    if (done != (pass == 1)) continue;
                    v.setViewVisibility(ROWS[shown], View.VISIBLE);
                    v.setImageViewResource(ICONS[shown], done ? R.drawable.ic_w_done : R.drawable.ic_w_todo);
                    v.setTextViewText(NAMES[shown], hb.names.get(i));
                    v.setTextColor(NAMES[shown], color(c, done ? R.color.w_text3 : R.color.w_text));
                    shown++;
                }
            }
            for (int i = shown; i < ROWS.length; i++) v.setViewVisibility(ROWS[i], View.GONE);
            int more = due - shown;
            v.setViewVisibility(R.id.w_more, more > 0 ? View.VISIBLE : View.GONE);
            if (more > 0) v.setTextViewText(R.id.w_more, "+" + Widgets.num(d, more));
        }
        return v;
    }
}
