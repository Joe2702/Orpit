package com.orbit.app;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * A bank message, the moment it arrives.
 *
 * The inbox scan in OrbitSms catches everything eventually, but only when the
 * app is opened, so a payment made at the till showed up whenever the user next
 * thought to look. This closes that gap without a background service:
 *
 *  - App open: the message is handed straight to the web layer, which imports
 *    it within seconds. Nothing to tap.
 *  - App closed: a notification with the amount, so the payment is seen when it
 *    happens. Opening the app (from the notification or otherwise) files it.
 *
 * The reading that decides category, account and duplicates stays in one place,
 * the web layer (smsParse.ts, ledger.ts). This class only looks far enough to
 * write a one-line notification: who sent it and how much. It stores nothing
 * and sends nothing; the text stays in the inbox, where the scan reads it.
 *
 * It does nothing unless the user turned on bank messages in Settings (the web
 * layer mirrors that switch into SharedPreferences, see OrbitSms.setLive), and
 * it ignores anything from a phone number and anything that looks like a
 * one-time code.
 */
public class SmsReceiver extends BroadcastReceiver {

    static final String PREFS = "orbit_sms";
    static final String KEY_LIVE = "live";
    private static final String CHANNEL = "bank_messages";

    /** The running plugin, while the app's process is alive. */
    static volatile OrbitSms plugin;
    /** Whether the app is on screen; set by MainActivity. */
    static volatile boolean visible;

    private static final Pattern CODE = Pattern.compile(
        "\\bOTP\\b|ONE[ -]?TIME|VERIFICATION|PASSCODE|PASSWORD|\\bPIN\\b|\\bCODE\\b|كلمة المرور|رمز|كود",
        Pattern.CASE_INSENSITIVE
    );
    private static final String CUR = "EGP|LE|L\\.E\\.?|E£|USD|EUR|GBP|SAR|AED|KWD|QAR|جنيه|ج\\.م";
    private static final String NUM = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
    private static final Pattern AMOUNT = Pattern.compile(
        "(" + CUR + ")\\s*(" + NUM + ")|(" + NUM + ")\\s*(" + CUR + ")",
        Pattern.CASE_INSENSITIVE
    );
    /** An amount right after one of these is a balance or a limit, not the payment. */
    private static final Pattern NOT_PAYMENT = Pattern.compile(
        "(BALANCE|BAL|LIMIT|AVAILABLE|رصيد|الرصيد|متاح|الحد)[^\\d]{0,20}$",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern MONEY_IN = Pattern.compile(
        "CREDITED|RECEIVED|DEPOSIT|REFUND|SALARY|ADDED TO|ايداع|إيداع|استلام|اضافة|إضافة|تحويل وارد",
        Pattern.CASE_INSENSITIVE
    );
    private static final Pattern MONEY_OUT = Pattern.compile(
        "DEBITED|CHARGED|PURCHASE|PAID|PAYMENT|WITHDRAW|SENT|SPENT|خصم|سحب|شراء|دفع|ارسال|إرسال",
        Pattern.CASE_INSENSITIVE
    );

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;
        if (!ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_LIVE, false)) return;

        SmsMessage[] parts;
        try {
            parts = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        } catch (Exception e) {
            return;
        }
        if (parts == null || parts.length == 0 || parts[0] == null) return;
        String sender = parts[0].getDisplayOriginatingAddress();
        if (!OrbitSms.isInstitution(sender, java.util.Collections.emptyList())) return;

        // A long message arrives in pieces; the body is all of them in order.
        StringBuilder sb = new StringBuilder();
        for (SmsMessage p : parts) {
            if (p != null && p.getDisplayMessageBody() != null) sb.append(p.getDisplayMessageBody());
        }
        String body = toLatinDigits(sb.toString());
        if (CODE.matcher(body).find()) return;
        String amount = amountOf(body);
        if (amount == null) return;

        // On screen: the web layer imports it now. It waits a moment first,
        // because the messaging app writes the message to the inbox just after
        // this broadcast, and the import reads it from there.
        OrbitSms live = plugin;
        if (visible && live != null) {
            live.announce(sender);
            return;
        }
        notify(ctx, sender, amount, body);
    }

    // Checked above with areNotificationsEnabled, and a refusal is caught.
    @SuppressLint("MissingPermission")
    private static void notify(Context ctx, String sender, String amount, String body) {
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
            if (!nm.areNotificationsEnabled()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager sys = ctx.getSystemService(NotificationManager.class);
                if (sys != null && sys.getNotificationChannel(CHANNEL) == null) {
                    NotificationChannel ch = new NotificationChannel(CHANNEL, "Bank messages", NotificationManager.IMPORTANCE_DEFAULT);
                    ch.setDescription("A payment your bank just told you about, ready to add");
                    sys.createNotificationChannel(ch);
                }
            }
            boolean in = MONEY_IN.matcher(body).find() && !MONEY_OUT.matcher(body).find();
            Intent open = new Intent(ctx, MainActivity.class);
            open.setAction(Intent.ACTION_VIEW);
            open.setData(Uri.parse("orbit://open/finances"));
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                ctx,
                CHANNEL.hashCode(),
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_orbit)
                .setContentTitle((in ? "Money in · " : "Payment · ") + amount)
                .setContentText(sender + " · tap to add it to Orbit")
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setAutoCancel(true)
                .setContentIntent(pi);
            nm.notify((sender + body).hashCode(), b.build());
        } catch (SecurityException ignored) {
            // Notifications refused on Android 13+: the scan still files it.
        } catch (Exception ignored) {
            // Never let a notification problem surface as a crash on SMS receipt.
        }
    }

    /** The payment's amount as written, skipping balances and limits. */
    static String amountOf(String body) {
        Matcher m = AMOUNT.matcher(body);
        while (m.find()) {
            String before = body.substring(Math.max(0, m.start() - 30), m.start());
            if (NOT_PAYMENT.matcher(before).find()) continue;
            String cur = m.group(1) != null ? m.group(1) : m.group(4);
            String num = m.group(2) != null ? m.group(2) : m.group(3);
            if (num == null || cur == null) continue;
            String c = cur.toUpperCase(Locale.ROOT);
            if (c.startsWith("L") || c.equals("E£") || cur.equals("جنيه") || cur.startsWith("ج")) c = "EGP";
            return c + " " + num;
        }
        return null;
    }

    /** Some banks write amounts in Arabic-Indic digits. */
    static String toLatinDigits(String s) {
        StringBuilder out = new StringBuilder(s.length());
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            if (ch >= '٠' && ch <= '٩') out.append((char) ('0' + (ch - '٠')));
            else if (ch >= '۰' && ch <= '۹') out.append((char) ('0' + (ch - '۰')));
            else if (ch == '٫') out.append('.');
            else if (ch == '٬') out.append(',');
            else out.append(ch);
        }
        return out.toString();
    }
}
