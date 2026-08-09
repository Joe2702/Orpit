package com.orbit.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** Every analytics widget, so placing several doesn't leave some stale. */
    private static final StatsWidget[] STATS_WIDGETS = {
        new HabitsWidget(),
        new WorkoutsWidget(),
        new SleepWidget(),
        new FinanceWidget(),
        new SummaryWidget(),
    };

    /**
     * Plugins that live in this app rather than in an npm package have to be
     * registered by hand, and before super.onCreate — the bridge builds its
     * plugin list there, and anything added afterwards is invisible to
     * JavaScript.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OrbitSteps.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Refresh the home-screen widgets as the app leaves the foreground.
     *
     * They read what the web layer stores through the Preferences plugin, and
     * their own update period is capped at 30 minutes by the platform.
     * Backgrounding is the moment the stored numbers are freshest and the user
     * is most likely heading to their home screen, so it's the right trigger.
     */
    // public, not protected: Capacitor's BridgeActivity declares the lifecycle
    // methods public, and an override may not narrow access.
    @Override
    public void onPause() {
        super.onPause();
        try {
            OrbitWidget.refreshAll(this);
            for (StatsWidget w : STATS_WIDGETS) {
                w.refresh(this);
            }
        } catch (Exception ignored) {
            // A widget refresh must never be able to disturb the app itself.
        }
    }
}
