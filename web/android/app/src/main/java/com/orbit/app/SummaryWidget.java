package com.orbit.app;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Today: today's habits as a ring, with steps, last night and this month's spending beside it. */
public class SummaryWidget extends WidgetBase {
    @Override
    int defaultWidth() {
        return 320;
    }

    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open", 7106));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "today", R.string.w_today));
        v.setTextViewText(R.id.w_date, Widgets.date(d));

        Widgets.Habits hb = Widgets.habits(d);
        int due = hb.due();
        boolean all = due > 0 && hb.doneCount == due;
        int ring = Math.max(64, Math.min(Math.min(w * 2 / 5, h - 56), 140));
        v.setImageViewBitmap(R.id.w_ring, Widgets.ring(c, ring, due == 0 ? 0f : hb.doneCount / (float) due,
            color(c, all ? R.color.w_good : R.color.w_accent), color(c, R.color.w_track)));
        v.setTextViewText(R.id.w_value, due == 0 ? "—" : Widgets.num(d, hb.doneCount) + "/" + Widgets.num(d, due));
        v.setTextViewText(R.id.w_sub, d == null ? "" : Widgets.t(d, "habitsShort"));

        if (d == null) {
            v.setTextViewText(R.id.w_steps_value, "");
            v.setTextViewText(R.id.w_sleep_value, "");
            v.setTextViewText(R.id.w_money_value, "");
            v.setTextViewText(R.id.w_title, c.getString(R.string.w_open));
            return v;
        }
        v.setTextViewText(R.id.w_steps_label, Widgets.t(d, "steps"));
        v.setTextViewText(R.id.w_sleep_label, Widgets.t(d, "sleep"));
        v.setTextViewText(R.id.w_money_label, Widgets.t(d, "money"));

        JSONObject st = d.optJSONObject("steps");
        v.setViewVisibility(R.id.w_steps, st == null ? View.GONE : View.VISIBLE);
        if (st != null) {
            long count = Widgets.steps(c, d);
            v.setTextViewText(R.id.w_steps_value, Widgets.num(d, count));
            v.setTextColor(R.id.w_steps_value, color(c, count >= st.optLong("goal", 8000) ? R.color.w_good : R.color.w_text));
        }
        JSONObject sl = d.optJSONObject("sleep");
        String last = sl != null && Widgets.fresh(d) && !sl.isNull("last") ? sl.optString("last") : "—";
        v.setTextViewText(R.id.w_sleep_value, last);
        JSONObject mo = d.optJSONObject("money");
        v.setTextViewText(R.id.w_money_value, mo == null ? "—" : mo.optString("spent"));

        v.setContentDescription(android.R.id.background, Widgets.t(d, "today") + ". " + Widgets.habitsLine(c, d, hb)
            + (st != null ? ". " + Widgets.t(d, "steps") + " " + Widgets.num(d, Widgets.steps(c, d)) : "")
            + ". " + Widgets.t(d, "sleep") + " " + last + ". " + Widgets.t(d, "money") + " " + (mo == null ? "—" : mo.optString("spent")));
        return v;
    }
}
