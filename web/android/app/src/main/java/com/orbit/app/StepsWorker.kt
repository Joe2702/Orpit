package com.orbit.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Every 15 minutes (Android's shortest period for repeating work, and only
 * while the step notifications are on): read today's steps, and announce a
 * quarter of the goal newly reached. Reaching the goal is also reported to the
 * server, which ticks the Steps habit.
 *
 * Reading while Orpit is closed needs Health Connect's background permission;
 * without it the read fails quietly and the app's own check, when it's open,
 * is what notices.
 */
class StepsWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val p = StepAlerts.prefs(ctx)
        if (!p.getBoolean("enabled", false)) return Result.success()
        val goal = p.getInt("goal", 0)
        if (goal <= 0) return Result.success()
        val steps = try {
            StepAlerts.todaySteps(ctx)
        } catch (e: SecurityException) {
            null // background reading not allowed
        } catch (e: Exception) {
            null
        } ?: return Result.success()
        val day = StepAlerts.today()
        val m = StepAlerts.record(ctx, day, steps, goal)
        if (m > 0) {
            StepAlerts.notify(ctx, m, steps, goal)
            if (m == 100) StepAlerts.reportGoal(ctx, day, steps)
        }
        return Result.success()
    }

    companion object {
        private const val NAME = "orpit-steps"

        fun schedule(ctx: Context) {
            WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                PeriodicWorkRequestBuilder<StepsWorker>(15, TimeUnit.MINUTES).build(),
            )
        }

        fun cancel(ctx: Context) {
            WorkManager.getInstance(ctx).cancelUniqueWork(NAME)
        }
    }
}
