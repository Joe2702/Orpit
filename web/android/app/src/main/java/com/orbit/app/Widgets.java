package com.orbit.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.net.Uri;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * What every home-screen widget shares: the app's data, the rings and bar
 * charts, numbers in the person's language, and the links back into the app.
 *
 * The app writes one JSON for all the widgets (web/src/lib/widgetData.ts) into
 * the Capacitor Preferences file. Everything in it is already worked out and
 * worded; the widgets only place it. Two things they work out themselves,
 * because they change while the app is closed: which habits are due today, and
 * today's steps (StepsWorker reads them in the background).
 */
final class Widgets {
    private Widgets() {}

    /** The Capacitor Preferences plugin's file, and the key widget.ts writes. */
    private static final String STORE = "CapacitorStorage";
    private static final String KEY = "widget_v2";

    /** Every widget, so a refresh reaches all the ones placed. */
    @SuppressWarnings("unchecked")
    static final Class<? extends WidgetBase>[] ALL = new Class[] {
        SummaryWidget.class, HabitsWidget.class, StepsWidget.class, SleepWidget.class,
        WorkoutsWidget.class, FinanceWidget.class, OrbitWidget.class,
    };

    // ---- The data ----

    /** The app's data for the widgets, or null before Orpit has written any. */
    static JSONObject data(Context c) {
        try {
            String raw = c.getSharedPreferences(STORE, Context.MODE_PRIVATE).getString(KEY, null);
            if (raw == null) return null;
            JSONObject d = new JSONObject(raw);
            return d.optInt("v") == 2 ? d : null;
        } catch (Exception e) {
            return null;
        }
    }

    static String today() {
        return LocalDate.now().toString();
    }

    /** Whether "today" in the data is today: done habits and last night are only true on that day. */
    static boolean fresh(JSONObject d) {
        return d != null && today().equals(d.optString("day"));
    }

    /** One of the app's words, or the widget's own until the app has written them. */
    static String t(Context c, JSONObject d, String key, int fallback) {
        JSONObject t = d == null ? null : d.optJSONObject("t");
        String v = t == null ? null : t.optString(key, null);
        return v == null || v.isEmpty() ? c.getString(fallback) : v;
    }

    static String t(JSONObject d, String key) {
        JSONObject t = d == null ? null : d.optJSONObject("t");
        return t == null ? "" : t.optString(key, "");
    }

    static Locale locale(JSONObject d) {
        String tag = d == null ? "" : d.optString("locale", "");
        return tag.isEmpty() ? Locale.getDefault() : Locale.forLanguageTag(tag);
    }

    /** 5,230 or ٥٬٢٣٠, as the app writes numbers. */
    static String num(JSONObject d, long n) {
        return NumberFormat.getIntegerInstance(locale(d)).format(n);
    }

    static String date(JSONObject d) {
        try {
            return LocalDate.now().format(DateTimeFormatter.ofPattern("EEE d MMM", locale(d)));
        } catch (Exception e) {
            return "";
        }
    }

    /** Today's habits: those due on this weekday, and which are done (only if the data is from today). */
    static final class Habits {
        final List<String> names = new ArrayList<>();
        final List<Boolean> done = new ArrayList<>();
        int doneCount;

        int due() {
            return names.size();
        }
    }

    static Habits habits(JSONObject d) {
        Habits h = new Habits();
        JSONObject hb = d == null ? null : d.optJSONObject("habits");
        JSONArray list = hb == null ? null : hb.optJSONArray("list");
        if (list == null) return h;
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1; // Sunday = 0, as in the app
        boolean fresh = fresh(d);
        for (int i = 0; i < list.length(); i++) {
            JSONObject x = list.optJSONObject(i);
            if (x == null) continue;
            String days = x.optString("days", "1111111");
            if (days.length() != 7 || days.charAt(dow) != '1') continue;
            boolean done = fresh && x.optBoolean("done");
            h.names.add(x.optString("name"));
            h.done.add(done);
            if (done) h.doneCount++;
        }
        return h;
    }

    /** "3 of 6 done", "All done for today", or "Nothing due today". */
    static String habitsLine(Context c, JSONObject d, Habits h) {
        if (d == null) return c.getString(R.string.w_open);
        if (h.due() == 0) return t(d, "noneDue");
        if (h.doneCount == h.due()) return t(d, "allDone");
        return t(d, "doneOf").replace("{done}", num(d, h.doneCount)).replace("{due}", num(d, h.due()));
    }

    /**
     * Today's steps: what the app last saw today, or the background step check's
     * newer count, whichever is higher (both only count if they're from today).
     */
    static long steps(Context c, JSONObject d) {
        JSONObject s = d == null ? null : d.optJSONObject("steps");
        long count = s != null && fresh(d) ? s.optLong("count", 0) : 0;
        SharedPreferences p = StepAlerts.INSTANCE.prefs(c);
        if (today().equals(p.getString("live_day", ""))) count = Math.max(count, p.getLong("live_count", 0));
        return count;
    }

    // ---- Opening the app ----

    static PendingIntent open(Context c, String url, int code) {
        Intent i = new Intent(c, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // A different request code for each, or Android hands every widget the
        // same PendingIntent and they all open the same place.
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    // ---- Redrawing ----

    /** Redraw every widget placed. Called when Orpit goes to the background. */
    static void refreshAll(Context c) {
        for (Class<? extends WidgetBase> cls : ALL) refresh(c, cls);
    }

    /** The widgets showing steps, after the background step check. */
    static void refreshSteps(Context c) {
        refresh(c, StepsWidget.class);
        refresh(c, SummaryWidget.class);
    }

    private static void refresh(Context c, Class<? extends WidgetBase> cls) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
            if (ids == null || ids.length == 0) return;
            WidgetBase w = cls.getDeclaredConstructor().newInstance();
            for (int id : ids) w.update(c, m, id);
        } catch (Exception ignored) {
            // A widget must never be able to disturb the app.
        }
    }

    // ---- Pictures: rings and bars, drawn here because a widget can't draw ----

    private static float density(Context c) {
        return c.getResources().getDisplayMetrics().density;
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** A ring filled clockwise from the top to [fraction]. */
    static Bitmap ring(Context c, int sizeDp, float fraction, int color, int track) {
        int px = clamp(Math.round(sizeDp * density(c)), 48, 420);
        Bitmap b = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        float stroke = px * 0.1f;
        RectF r = new RectF(stroke / 2, stroke / 2, px - stroke / 2, px - stroke / 2);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setStyle(Paint.Style.STROKE);
        p.setStrokeWidth(stroke);
        p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(track);
        cv.drawArc(r, 0, 360, false, p);
        float f = Math.max(0f, Math.min(1f, fraction));
        if (f > 0) {
            p.setColor(color);
            // A full ring drawn as 360° with round caps shows a seam; just under closes it.
            cv.drawArc(r, -90, f >= 1f ? 359.9f : Math.max(f * 360f, 6f), false, p);
        }
        return b;
    }

    /**
     * Seven bars, oldest first, today's in full colour and the rest softer, with
     * a one-letter day under each. In a right-to-left language today is on the left.
     */
    static Bitmap bars(Context c, int wDp, int hDp, double[] values, String[] labels, int color, int track, int labelColor, boolean rtl) {
        float dn = density(c);
        int w = clamp(Math.round(wDp * dn), 96, 760);
        int h = clamp(Math.round(hDp * dn), 40, 360);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        int n = values.length;
        if (n == 0) return b;
        float labelH = labels != null ? 15 * dn : 0;
        float chartH = h - labelH;
        float slot = (float) w / n;
        float bw = Math.min(slot * 0.58f, 20 * dn);
        double max = 0;
        for (double v : values) max = Math.max(max, v);

        Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(10.5f * dn);
        text.setTextAlign(Paint.Align.CENTER);
        text.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        int soft = (color & 0x00FFFFFF) | (0x66 << 24);

        for (int i = 0; i < n; i++) {
            int pos = rtl ? n - 1 - i : i;
            float cx = slot * pos + slot / 2;
            double v = values[i];
            boolean last = i == n - 1;
            float bh = v > 0 && max > 0 ? Math.max(4 * dn, (float) (v / max) * (chartH - 2 * dn)) : 3 * dn;
            bar.setColor(v > 0 ? (last ? color : soft) : track);
            float radius = Math.min(bw / 2, 6 * dn);
            cv.drawRoundRect(new RectF(cx - bw / 2, chartH - bh, cx + bw / 2, chartH), radius, radius, bar);
            if (labels != null && i < labels.length) {
                text.setColor(last ? color : labelColor);
                cv.drawText(labels[i], cx, h - 3 * dn, text);
            }
        }
        return b;
    }

    /** A thin rounded progress bar, filling from the start of the line (the right, in Arabic). */
    static Bitmap progress(Context c, int wDp, float fraction, int color, int track, boolean rtl) {
        float dn = density(c);
        int w = clamp(Math.round(wDp * dn), 64, 760);
        int h = Math.round(8 * dn);
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(track);
        cv.drawRoundRect(new RectF(0, 0, w, h), h / 2f, h / 2f, p);
        float f = Math.max(0f, Math.min(1f, fraction));
        if (f > 0) {
            p.setColor(color);
            float fw = Math.max(h, w * f);
            cv.drawRoundRect(rtl ? new RectF(w - fw, 0, w, h) : new RectF(0, 0, fw, h), h / 2f, h / 2f, p);
        }
        return b;
    }

    static double[] series(JSONObject o, String key) {
        JSONArray a = o == null ? null : o.optJSONArray(key);
        if (a == null) return new double[0];
        double[] v = new double[a.length()];
        for (int i = 0; i < v.length; i++) v[i] = a.optDouble(i, 0);
        return v;
    }

    static String[] labels(JSONObject o, String key) {
        JSONArray a = o == null ? null : o.optJSONArray(key);
        if (a == null) return null;
        String[] v = new String[a.length()];
        for (int i = 0; i < v.length; i++) v[i] = a.optString(i, "");
        return v;
    }
}
