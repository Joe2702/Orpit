package com.orbit.app;

import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Reading the phone's SMS inbox, so bank messages can become transactions.
 *
 * The inbox is the source of truth: re-reading it from a watermark catches
 * every message, including the ones that arrived while the phone was off. What
 * it can't do is notice a payment the moment it happens; SmsReceiver does that,
 * and hands over to this class (an event the web layer answers with a scan)
 * rather than reading anything itself.
 *
 * Nothing is stored or forwarded here. This class hands the text to the web
 * layer, which reads it (web/src/lib/smsParse.ts) and keeps only the amount,
 * the merchant and the date. The message bodies never leave the device.
 *
 * Scope: only messages newer than the watermark the caller passes, and only
 * from alphanumeric sender ids — banks, wallets, services — never from a phone
 * number. A finance app has no business reading a user's personal messages, and
 * the cheapest way to honour that is never to copy them out of the cursor.
 */
@CapacitorPlugin(
    name = "OrbitSms",
    permissions = {
        @Permission(alias = OrbitSms.SMS, strings = { "android.permission.READ_SMS" }),
        // Separate, so an install that granted reading before instant capture
        // existed still reads as on.
        @Permission(alias = OrbitSms.LIVE, strings = { "android.permission.RECEIVE_SMS" })
    }
)
public class OrbitSms extends Plugin {

    static final String SMS = "sms";
    static final String LIVE = "live";

    @Override
    public void load() {
        SmsReceiver.plugin = this;
    }

    /** A bank message just arrived while the app is open: time to scan. */
    void announce(String sender) {
        JSObject data = new JSObject();
        data.put("sender", sender == null ? "" : sender);
        notifyListeners("message", data);
    }

    private static final Uri INBOX = Uri.parse("content://sms/inbox");

    /**
     * A ceiling on one read.
     *
     * The first scan after switching the feature on can face years of messages.
     * The parser drops the ones that aren't payments, but handing 20,000 rows
     * across the bridge in a single call is what makes an app appear to hang.
     */
    private static final int MAX_ROWS = 500;

    /** Whether this device can receive SMS at all, and whether we may read it. */
    @PluginMethod
    public void check(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", hasTelephony());
        out.put("granted", getPermissionState(SMS) == PermissionState.GRANTED);
        out.put("live", getPermissionState(LIVE) == PermissionState.GRANTED);
        call.resolve(out);
    }

    /**
     * Mirror the Settings switch where SmsReceiver can see it. The receiver runs
     * without the web layer, so it can't ask; it reads this.
     */
    @PluginMethod
    public void setLive(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getContext().getSharedPreferences(SmsReceiver.PREFS, Context.MODE_PRIVATE).edit().putBoolean(SmsReceiver.KEY_LIVE, on).apply();
        check(call);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (!hasTelephony()) {
            check(call);
            return;
        }
        if (getPermissionState(SMS) == PermissionState.GRANTED && getPermissionState(LIVE) == PermissionState.GRANTED) {
            check(call);
            return;
        }
        // Both together. They are one permission group, so Android asks once;
        // and on an install that already reads messages, adding the second is
        // granted without asking at all.
        requestPermissionForAliases(new String[] { SMS, LIVE }, call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        check(call);
    }

    /**
     * Messages from banks and wallets newer than `since`, oldest first.
     *
     * Which senders count is decided by one rule rather than a list: a sender id
     * that contains a letter. Banks and wallets send from alphanumeric ids
     * ("NBE", "CIB", "VF-Cash", "InstaPay"); people send from phone numbers. The
     * first version matched a hand-written list of bank names, and every id it
     * missed — "VF-Cash", "BDC", "CA-Egypt", "IPN" — was a bank whose messages
     * were silently never read. A list is out of date the day a bank renames its
     * sender; the rule is not. Callers may still pass extra `senders` to accept
     * a bank that uses a numeric short code.
     *
     * The filter runs here rather than in the query's WHERE clause because some
     * manufacturers' SMS providers reject anything beyond simple comparisons.
     * For rows that fail it only the address is read; the body of a personal
     * message is never copied out of the cursor.
     *
     * Oldest first, so that if the batch is cut short the next call resumes
     * exactly where this one stopped instead of leaving a hole in the middle.
     */
    @PluginMethod
    public void read(PluginCall call) {
        if (!hasTelephony()) {
            call.reject("This device does not handle SMS");
            return;
        }
        if (getPermissionState(SMS) != PermissionState.GRANTED) {
            call.reject("Permission not granted");
            return;
        }

        long since = call.getLong("since", 0L);
        JSArray extra = call.getArray("senders", new JSArray());
        java.util.List<String> also = new java.util.ArrayList<>();
        for (int i = 0; i < extra.length(); i++) {
            try {
                also.add(extra.getString(i).toLowerCase(java.util.Locale.ROOT));
            } catch (org.json.JSONException ignored) {
                // A malformed entry is skipped, not fatal.
            }
        }

        JSArray out = new JSArray();
        int scanned = 0;
        long scannedUntil = since;
        boolean more = false;
        Cursor c = null;
        try {
            // No LIMIT in the sort order. Newer Android versions validate the
            // sort clause of content-provider queries and throw on "LIMIT",
            // which made every read fail outright — and since a failed read was
            // handled quietly, the feature simply did nothing. The cap is
            // applied while iterating instead, which works on every version.
            c = getContext().getContentResolver().query(
                INBOX,
                new String[] { "_id", "address", "body", "date" },
                "date > ?",
                new String[] { String.valueOf(since) },
                "date ASC"
            );
            if (c != null) {
                while (c.moveToNext()) {
                    String address = c.getString(1);
                    long date = c.getLong(3);
                    if (out.length() >= MAX_ROWS) {
                        more = true;
                        break;
                    }
                    scanned++;
                    scannedUntil = Math.max(scannedUntil, date);
                    if (!isInstitution(address, also)) continue;
                    JSObject m = new JSObject();
                    m.put("id", c.getString(0));
                    m.put("sender", address == null ? "" : address);
                    m.put("body", c.getString(2) == null ? "" : c.getString(2));
                    m.put("ts", date);
                    out.put(m);
                }
            }
        } catch (Exception e) {
            // A manufacturer that has locked the SMS provider down, or a
            // permission revoked between the check above and this query. The
            // message is passed up so the app can show it rather than guess.
            call.reject("Could not read messages: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return;
        } finally {
            if (c != null) c.close();
        }

        JSObject res = new JSObject();
        res.put("messages", out);
        // How many inbox rows were looked at, and how far through the inbox the
        // scan got. The second lets the caller move its watermark past runs of
        // personal messages, so they are not re-scanned on every launch.
        res.put("scanned", scanned);
        res.put("scannedUntil", scannedUntil);
        res.put("more", more);
        call.resolve(res);
    }

    /** A sender id with a letter in it, or one the caller listed explicitly. */
    static boolean isInstitution(String address, java.util.List<String> also) {
        if (address == null || address.isEmpty()) return false;
        for (int i = 0; i < address.length(); i++) {
            if (Character.isLetter(address.charAt(i))) return true;
        }
        String a = address.toLowerCase(java.util.Locale.ROOT);
        for (String s : also) {
            if (!s.isEmpty() && a.contains(s)) return true;
        }
        return false;
    }

    private boolean hasTelephony() {
        return getContext()
            .getPackageManager()
            .hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
    }
}
