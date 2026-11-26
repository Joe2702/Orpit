package com.orbit.app;

import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/** Money: spent this month, against the budget, and what's left to spend a day. */
public class FinanceWidget extends WidgetBase {
    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_money);
        v.setOnClickPendingIntent(android.R.id.background, Widgets.open(c, "orbit://open/finances", 7105));
        v.setTextViewText(R.id.w_title, Widgets.t(c, d, "money", R.string.w_money));
        JSONObject s = d == null ? null : d.optJSONObject("money");
        if (s == null) {
            v.setTextViewText(R.id.w_value, "—");
            v.setTextViewText(R.id.w_caption, c.getString(R.string.w_open));
            v.setViewVisibility(R.id.w_bar, View.GONE);
            v.setViewVisibility(R.id.w_bar_text, View.GONE);
            v.setViewVisibility(R.id.w_safe, View.GONE);
            return v;
        }
        v.setTextViewText(R.id.w_value, s.optString("spent"));
        v.setTextViewText(R.id.w_caption, Widgets.t(d, "spent"));
        boolean budget = !s.isNull("budgetPct");
        v.setViewVisibility(R.id.w_bar, budget ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_bar_text, budget ? View.VISIBLE : View.GONE);
        if (budget) {
            int pct = s.optInt("budgetPct");
            // Over the budget, the bar says so in the warning colour.
            int col = color(c, pct > 100 ? R.color.w_train : R.color.w_money);
            v.setImageViewBitmap(R.id.w_bar, Widgets.progress(c, w - 32, pct / 100f, col, color(c, R.color.w_track), d.optBoolean("rtl")));
            v.setTextViewText(R.id.w_bar_text, s.optString("budgetText"));
        }
        boolean safe = !s.isNull("safe");
        v.setViewVisibility(R.id.w_safe, safe ? View.VISIBLE : View.GONE);
        if (safe) v.setTextViewText(R.id.w_safe, s.optString("safe"));
        v.setContentDescription(android.R.id.background, Widgets.t(d, "money") + ": " + s.optString("spent") + " " + Widgets.t(d, "spent")
            + (budget ? ". " + s.optString("budgetText") : ""));
        return v;
    }
}
