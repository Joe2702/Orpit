package com.orbit.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
     * Refresh the home-screen widget as the app leaves the foreground.
     *
     * The widget reads the summary the web layer stores through the Preferences
     * plugin, and its own update period is capped at 30 minutes by the platform.
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
        } catch (Exception ignored) {
            // A widget refresh must never be able to disturb the app itself.
        }
    }
}
