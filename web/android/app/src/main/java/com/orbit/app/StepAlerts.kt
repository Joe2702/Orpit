package com.orbit.app

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.Locale

/**
 * Today's steps against the goal, and the notifications at 25%, 50%, 75% and
 * 100% of it.
 *
 * The app tells this side what it needs through OrbitSteps.configure: whether
 * it's on, the goal, the words in the person's language, and the sign-in to
 * report a reached goal with. StepsWorker reads the count every 15 minutes
 * while Orpit is closed; the app reports what it sees while it's open. Both go
 * through record(), so each quarter is announced once a day, by whichever saw
 * it first.
 */
object StepAlerts {
    const val PREFS = "orpit_steps"
    const val BACKGROUND_PERMISSION = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
    private const val CHANNEL = "step_goal"

    fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** The quarter of the goal reached: 0, 25, 50, 75 or 100. The same as milestoneOf() in lib/steps.ts. */
    fun milestoneOf(steps: Long, goal: Int): Int {
        if (goal <= 0) return 0
        val p = steps.toDouble() / goal
        return when {
            p >= 1.0 -> 100
            p >= 0.75 -> 75
            p >= 0.5 -> 50
            p >= 0.25 -> 25
            else -> 0
        }
    }

    /**
     * Note a count for [day]. Returns the quarter newly reached (0 if none):
     * the highest one passed since the last count that day, so a jump from 10%
     * to 60% says "halfway" once rather than "a quarter" and "halfway" at once.
     */
    @Synchronized
    fun record(ctx: Context, day: String, steps: Long, goal: Int): Int {
        val p = prefs(ctx)
        val before = if (p.getString("day", "") == day) p.getInt("milestone", 0) else 0
        val now = milestoneOf(steps, goal)
        p.edit().putString("day", day).putInt("milestone", maxOf(before, now)).apply()
        return if (now > before) now else 0
    }

    /** The phone's own date, as the app writes it (YYYY-MM-DD). */
    fun today(): String = LocalDate.now(ZoneId.systemDefault()).toString()

    /** Steps since midnight, as Health Connect totals them across apps. Null when it can't be read. */
    suspend fun todaySteps(ctx: Context): Long? {
        if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) return null
        val zone = ZoneId.systemDefault()
        val start = LocalDate.now(zone).atStartOfDay(zone).toInstant()
        val result = HealthConnectClient.getOrCreate(ctx).aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(start, Instant.now()),
            )
        )
        return result[StepsRecord.COUNT_TOTAL] ?: 0L
    }

    /** Whether this phone's Health Connect lets an app read while it's closed at all. */
    fun backgroundAvailable(ctx: Context): Boolean = try {
        HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE &&
            HealthConnectClient.getOrCreate(ctx).features.getFeatureStatus(
                HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
            ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
    } catch (e: Exception) {
        false
    }

    suspend fun backgroundGranted(ctx: Context): Boolean = try {
        HealthConnectClient.getOrCreate(ctx).permissionController.getGrantedPermissions().contains(BACKGROUND_PERMISSION)
    } catch (e: Exception) {
        false
    }

    private fun format(ctx: Context, n: Long): String {
        val tag = prefs(ctx).getString("locale", "en-US") ?: "en-US"
        return NumberFormat.getIntegerInstance(Locale.forLanguageTag(tag)).format(n)
    }

    // Checked with areNotificationsEnabled, and a refusal is caught.
    @SuppressLint("MissingPermission")
    fun notify(ctx: Context, milestone: Int, steps: Long, goal: Int) {
        try {
            val nm = NotificationManagerCompat.from(ctx)
            if (!nm.areNotificationsEnabled()) return
            val p = prefs(ctx)
            val text = JSONObject(p.getString("texts", "{}") ?: "{}").optJSONObject("m$milestone") ?: return
            val left = maxOf(0L, goal - steps)
            fun fill(s: String) = s
                .replace("{steps}", format(ctx, steps))
                .replace("{goal}", format(ctx, goal.toLong()))
                .replace("{left}", format(ctx, left))
            val ar = (p.getString("locale", "") ?: "").startsWith("ar")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val sys = ctx.getSystemService(NotificationManager::class.java)
                if (sys != null && sys.getNotificationChannel(CHANNEL) == null) {
                    val ch = NotificationChannel(CHANNEL, if (ar) "هدف الخطوات" else "Step goal", NotificationManager.IMPORTANCE_DEFAULT)
                    ch.description = if (ar) "عند 25% و50% و75% من هدف خطواتك، وعند الوصول إليه" else "At 25%, 50% and 75% of your step goal, and when you reach it"
                    sys.createNotificationChannel(ch)
                }
            }
            val open = Intent(ctx, MainActivity::class.java)
                .setAction(Intent.ACTION_VIEW)
                .setData(Uri.parse("orbit://open/steps"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            val pi = PendingIntent.getActivity(ctx, CHANNEL.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val body = fill(text.optString("body"))
            val b = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_orbit)
                .setContentTitle(fill(text.optString("title")))
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setAutoCancel(true)
                .setContentIntent(pi)
            // How far along, as a bar, until the goal itself.
            if (milestone < 100) b.setProgress(100, minOf(100, (steps * 100 / maxOf(1, goal)).toInt()), false)
            // One notification for the day's steps, each quarter replacing the last.
            nm.notify(CHANNEL.hashCode(), b.build())
        } catch (e: SecurityException) {
            // Notifications refused on Android 13+.
        } catch (e: Exception) {
            // Never let a notification problem take down the check.
        }
    }

    /**
     * Tell the server the goal was reached, so the Steps habit is ticked even
     * if Orpit isn't opened today. Only then: a request every quarter of an
     * hour from every phone would keep the server and its database awake
     * around the clock. Everything else is sent when the app next opens.
     */
    fun reportGoal(ctx: Context, day: String, steps: Long) {
        val p = prefs(ctx)
        val base = p.getString("apiBase", "") ?: ""
        val token = p.getString("token", null) ?: return
        if (!base.startsWith("https://")) return
        var c: HttpURLConnection? = null
        try {
            c = (URL("$base/api/steps?lean=1").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 20_000
                readTimeout = 30_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Authorization", "Bearer $token")
            }
            val body = JSONObject().put("days", JSONArray().put(JSONObject().put("day", day).put("count", steps)))
            c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            c.responseCode
        } catch (e: Exception) {
            // The app sends it again when it next opens.
        } finally {
            c?.disconnect()
        }
    }
}
