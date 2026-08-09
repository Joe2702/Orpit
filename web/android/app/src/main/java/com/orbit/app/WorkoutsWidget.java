package com.orbit.app;

/** Home-screen widget: training this week. See StatsWidget for the rendering. */
public class WorkoutsWidget extends StatsWidget {
    @Override
    protected String key() {
        return "widget_workouts";
    }

    @Override
    protected String link() {
        return "orbit://open/workouts";
    }
}
