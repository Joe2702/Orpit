package com.orbit.app;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * The phone's own step counter.
 *
 * Deliberately not Health Connect: this reads the hardware counter the OS keeps
 * running anyway, which needs one ordinary runtime permission instead of a Play
 * review declaration, works with no Google account, and cannot be switched off
 * by another app. It is a smaller promise, and one that can ship.
 *
 * The sensor reports steps since the device booted. Turning that into "steps
 * today" is done in JavaScript (web/src/lib/steps.ts) where it can be tested;
 * this class only hands over the raw reading.
 */
@CapacitorPlugin(
    name = "OrbitSteps",
    permissions = {
        @Permission(alias = OrbitSteps.ACTIVITY, strings = { "android.permission.ACTIVITY_RECOGNITION" })
    }
)
public class OrbitSteps extends Plugin {

    static final String ACTIVITY = "activity";

    /** The sensor answers within a frame or two; this is only a backstop. */
    private static final long TIMEOUT_MS = 2500;

    private SensorManager sensors;
    private Sensor counter;

    @Override
    public void load() {
        sensors = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        if (sensors != null) {
            counter = sensors.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        }
    }

    /** Whether this device has the sensor at all, and whether we may read it. */
    @PluginMethod
    public void check(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", counter != null);
        out.put("granted", hasPermission());
        call.resolve(out);
    }

    @PluginMethod
    public void request(PluginCall call) {
        if (counter == null) {
            JSObject out = new JSObject();
            out.put("available", false);
            out.put("granted", false);
            call.resolve(out);
            return;
        }
        if (hasPermission()) {
            check(call);
            return;
        }
        requestPermissionForAlias(ACTIVITY, call, "afterPermission");
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        check(call);
    }

    /**
     * One reading of the cumulative counter.
     *
     * The sensor is event-driven, so this listens for a single event and then
     * unregisters — leaving a listener attached would keep the sensor awake for
     * the life of the process to answer a question asked once on resume.
     */
    @PluginMethod
    public void read(final PluginCall call) {
        if (counter == null || sensors == null) {
            call.reject("No step sensor on this device");
            return;
        }
        if (!hasPermission()) {
            call.reject("Permission not granted");
            return;
        }

        final Handler handler = new Handler(Looper.getMainLooper());
        // One-element array so the listener and the timeout can share it: a
        // plain boolean can't be assigned from an inner class.
        final boolean[] done = { false };

        final SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                if (done[0]) return;
                done[0] = true;
                handler.removeCallbacksAndMessages(null);
                sensors.unregisterListener(this);
                JSObject out = new JSObject();
                out.put("sinceBoot", (double) event.values[0]);
                call.resolve(out);
            }

            @Override
            public void onAccuracyChanged(Sensor sensor, int accuracy) {
                // Nothing useful to do: a step count has no accuracy tiers.
            }
        };

        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (done[0]) return;
                done[0] = true;
                sensors.unregisterListener(listener);
                // Rejecting rather than resolving zero: zero is a real reading,
                // and a fabricated one would reset the user's day to nothing.
                call.reject("Step sensor did not respond");
            }
        }, TIMEOUT_MS);

        sensors.registerListener(listener, counter, SensorManager.SENSOR_DELAY_UI);
    }

    /** Below Android 10 the permission does not exist and is granted at install. */
    private boolean hasPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return getPermissionState(ACTIVITY) == com.getcapacitor.PermissionState.GRANTED;
    }
}
