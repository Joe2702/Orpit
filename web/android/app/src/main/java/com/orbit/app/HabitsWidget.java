package com.orbit.app;

/** Home-screen widget: habit progress. See StatsWidget for the rendering. */
public class HabitsWidget extends StatsWidget {
    @Override
    protected String key() {
        return "widget_habits";
    }

    @Override
    protected String link() {
        return "orbit://open/habits";
    }
}
