package com.orbit.app;

/** Home-screen widget: spending this month. See StatsWidget for the rendering. */
public class FinanceWidget extends StatsWidget {
    @Override
    protected String key() {
        return "widget_finance";
    }

    @Override
    protected String link() {
        return "orbit://open/finances";
    }
}
