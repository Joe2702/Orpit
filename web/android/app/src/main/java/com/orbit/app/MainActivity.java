package com.orbit.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

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
