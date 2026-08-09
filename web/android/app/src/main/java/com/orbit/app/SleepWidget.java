package com.orbit.app;

/** Home-screen widget: sleep this week. See StatsWidget for the rendering. */
public class SleepWidget extends StatsWidget {
    @Override
    protected String key() {
        return "widget_sleep";
    }

    @Override
    protected String link() {
        return "orbit://open/sleep";
    }
}
