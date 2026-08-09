package com.orbit.app;

/** Home-screen widget: a bit of everything. See StatsWidget for the rendering. */
public class SummaryWidget extends StatsWidget {
    @Override
    protected String key() {
        return "widget_summary_stats";
    }

    @Override
    protected String link() {
        return "orbit://open";
    }
}
