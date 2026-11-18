package com.orbit.app

import androidx.activity.result.ActivityResult
import androidx.health.connect.client.PermissionController
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * The app's side of the step notifications (see StepAlerts and lib/steps.ts):
 * what to check and say, counts seen while the app is open, and Health
 * Connect's permission to read while it's closed.
 */
@CapacitorPlugin(name = "OrbitSteps")
class OrbitSteps : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val contract = PermissionController.createRequestPermissionResultContract()

    @PluginMethod
    fun configure(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val token = call.getString("token")
        StepAlerts.prefs(context).edit().apply {
            putBoolean("enabled", enabled)
            putInt("goal", call.getInt("goal") ?: 0)
            putString("apiBase", call.getString("apiBase") ?: "")
            if (token.isNullOrEmpty()) remove("token") else putString("token", token)
            putString("locale", call.getString("locale") ?: "en-US")
            putString("texts", call.getObject("texts")?.toString() ?: "{}")
        }.apply()
        try {
            if (enabled) StepsWorker.schedule(context) else StepsWorker.cancel(context)
        } catch (e: Exception) {
            // WorkManager not ready: the next configure tries again.
        }
        call.resolve()
    }

    /** A count the app saw while open. Returns the quarter newly reached; the app shows it itself. */
    @PluginMethod
    fun report(call: PluginCall) {
        val day = call.getString("day")
        if (day.isNullOrEmpty()) {
            call.reject("day is required")
            return
        }
        val steps = (call.getDouble("steps") ?: 0.0).toLong()
        val goal = call.getInt("goal") ?: 0
        call.resolve(JSObject().put("milestone", StepAlerts.record(context, day, steps, goal)))
    }

    @PluginMethod
    fun backgroundStatus(call: PluginCall) {
        scope.launch {
            val available = StepAlerts.backgroundAvailable(context)
            val granted = available && StepAlerts.backgroundGranted(context)
            call.resolve(JSObject().put("available", available).put("granted", granted))
        }
    }

    @PluginMethod
    fun requestBackground(call: PluginCall) {
        if (!StepAlerts.backgroundAvailable(context)) {
            call.resolve(JSObject().put("granted", false))
            return
        }
        try {
            startActivityForResult(call, contract.createIntent(context, setOf(StepAlerts.BACKGROUND_PERMISSION)), "onBackgroundResult")
        } catch (e: Exception) {
            call.resolve(JSObject().put("granted", false))
        }
    }

    @ActivityCallback
    private fun onBackgroundResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        scope.launch { call.resolve(JSObject().put("granted", StepAlerts.backgroundGranted(context))) }
    }
}
