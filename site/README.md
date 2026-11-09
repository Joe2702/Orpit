# Orbit on a computer

The desktop website: its own design, layout and pages, built for a big screen,
a mouse and a keyboard. Phones keep the phone app (`web/`), which is also what
the Android app bundles.

- **Pages:** Overview, Habits (and Counters), Fitness (Workouts and Sleep),
  Money (Overview, Transactions, Accounts, Budgets, Goals, Bills, Categories),
  Tasks, Insights, Settings, and sign-in/sign-up/password reset.
- **Desktop interactions:** real page addresses, a command menu (Ctrl/⌘ K),
  keyboard shortcuts (`?` lists them), side panels for details, dialogs for
  forms, tables with sorting, bulk actions and CSV export.
- **Shared with the phone app:** the arithmetic (balances, streaks, safe to
  spend, dates, money formatting) and the Arabic for words both apps use, imported
  from `web/src` as `@core/...`. Nothing visual is shared.
- **Arabic:** the website's own phrases are in `src/i18n-ar.ts`; `npm test`
  fails if any phrase is missing.

## Which app a visitor gets

The server (`server/src/view.ts`) sends computers this site and phones the phone
app. Either can switch: "Use the phone layout" here, "Desktop site" there. The
choice is the `orbit_view` cookie. The site's files are served from `/d/`.

## Commands

```
npm install          # needs web/ installed too, for @core
npm run dev          # http://localhost:5174, API proxied to :4000
npm run build        # type check + build to dist/
npm test
VITE_DEMO=1 npx vite build --outDir dist-demo --base ./   # self-contained demo
```

`VITE_GOOGLE_CLIENT_ID` (the same one the phone build uses) shows the Google
sign-in button.
