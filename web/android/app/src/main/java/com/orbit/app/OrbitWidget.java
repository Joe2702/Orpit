package com.orbit.app;

import android.content.Context;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * Quick log: one tap to today's habits, or straight into logging a workout, a
 * night or an expense, with the same orbit:// links the app-icon shortcuts use.
 * (Named for the first Orpit widget, so ones already placed become this.)
 */
public class OrbitWidget extends WidgetBase {
    @Override
    int defaultWidth() {
        return 320;
    }

    @Override
    int defaultHeight() {
        return 72;
    }

    @Override
    RemoteViews build(Context c, JSONObject d, int w, int h) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_quick);
        v.setOnClickPendingIntent(R.id.w_habit, Widgets.open(c, "orbit://open/habits", 7201));
        v.setOnClickPendingIntent(R.id.w_workout, Widgets.open(c, "orbit://log/workout", 7202));
        v.setOnClickPendingIntent(R.id.w_sleep, Widgets.open(c, "orbit://log/sleep", 7203));
        v.setOnClickPendingIntent(R.id.w_expense, Widgets.open(c, "orbit://log/expense", 7204));
        v.setTextViewText(R.id.w_habit_label, Widgets.t(c, d, "habit", R.string.w_habit));
        v.setTextViewText(R.id.w_workout_label, Widgets.t(c, d, "workout", R.string.w_workout));
        v.setTextViewText(R.id.w_sleep_label, Widgets.t(c, d, "sleep", R.string.w_sleep));
        v.setTextViewText(R.id.w_expense_label, Widgets.t(c, d, "expense", R.string.w_expense));
        return v;
    }
}
