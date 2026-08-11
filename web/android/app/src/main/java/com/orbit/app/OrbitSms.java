package com.orbit.app;

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
 * Deliberately a *reader*, not a listener. A broadcast receiver would catch
 * messages the moment they arrive, but it cannot do anything useful with one
 * while the app is closed — there is no background service here, and adding one
 * to save a few seconds is a poor trade. Re-reading the inbox from a watermark
 * when the app next opens catches everything a receiver would have caught,
 * including the messages that arrived while the phone was off.
 *
 * Nothing is stored or forwarded here. This class hands the text to the web
 * layer, which reads it (web/src/lib/smsParse.ts) and keeps only the amount,
 * the merchant and the date. The message bodies never leave the device.
 *
 * Scope: only messages newer than the watermark the caller passes, and — when
 * the caller supplies senders — only from those. A finance app has no business
 * reading a user's personal messages, and the cheapest way to honour that is
 * not to fetch them.
 */
@CapacitorPlugin(
    name = "OrbitSms",
    permissions = {
        @Permission(alias = OrbitSms.SMS, strings = { "android.permission.READ_SMS" })
    }
)
public class OrbitSms extends Plugin {

    static final String SMS = "sms";

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
        call.resolve(out);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (!hasTelephony()) {
            check(call);
            return;
        }
        if (getPermissionState(SMS) == PermissionState.GRANTED) {
            check(call);
            return;
        }
        requestPermissionForAlias(SMS, call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        check(call);
    }

    /**
     * Messages newer than `since`, oldest first.
     *
     * Oldest first matters: the caller advances its watermark as it goes, so if
     * the batch is cut short by MAX_ROWS the next call resumes exactly where
     * this one stopped instead of leaving a hole in the middle.
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
        JSArray senders = call.getArray("senders", new JSArray());

        String selection = "date > ?";
        String[] args;
        try {
            // Filtering in the query, not after it: an unfiltered read would
            // pull every personal message into memory before discarding it.
            if (senders.length() > 0) {
                StringBuilder clause = new StringBuilder("date > ? AND (");
                args = new String[1 + senders.length()];
                args[0] = String.valueOf(since);
                for (int i = 0; i < senders.length(); i++) {
                    if (i > 0) clause.append(" OR ");
                    clause.append("address LIKE ?");
                    args[i + 1] = "%" + senders.getString(i) + "%";
                }
                clause.append(")");
                selection = clause.toString();
            } else {
                args = new String[] { String.valueOf(since) };
            }
        } catch (org.json.JSONException e) {
            call.reject("Bad sender list");
            return;
        }

        JSArray out = new JSArray();
        Cursor c = null;
        try {
            c = getContext().getContentResolver().query(
                INBOX,
                new String[] { "_id", "address", "body", "date" },
                selection,
                args,
                "date ASC LIMIT " + MAX_ROWS
            );
            if (c != null) {
                while (c.moveToNext()) {
                    JSObject m = new JSObject();
                    m.put("id", c.getString(0));
                    m.put("sender", c.getString(1) == null ? "" : c.getString(1));
                    m.put("body", c.getString(2) == null ? "" : c.getString(2));
                    m.put("ts", c.getLong(3));
                    out.put(m);
                }
            }
        } catch (Exception e) {
            // A manufacturer that has locked the SMS provider down, or a
            // permission revoked between the check above and this query. Either
            // way it is a state of the world, not a crash.
            call.reject("Could not read messages: " + e.getMessage());
            return;
        } finally {
            if (c != null) c.close();
        }

        JSObject res = new JSObject();
        res.put("messages", out);
        // Telling the caller the batch was full is what lets it loop instead of
        // silently stopping halfway through a first import.
        res.put("more", out.length() >= MAX_ROWS);
        call.resolve(res);
    }

    private boolean hasTelephony() {
        return getContext()
            .getPackageManager()
            .hasSystemFeature(PackageManager.FEATURE_TELEPHONY);
    }
}
