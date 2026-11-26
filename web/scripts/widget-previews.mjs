// The pictures people choose a home-screen widget by, in Android's widget
// picker: every widget drawn as Widgets.java draws it, with sample numbers, in
// English and Arabic, light and dark. Rerun after changing how a widget looks:
//
//   node scripts/widget-previews.mjs android/app/src/main/res
//
// (needs Playwright's Chromium). A sheet of all seven per variant goes to the
// system's temp folder, for a look; it must never land in res/, where Android
// would refuse to build with a stray file in it.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
// Loaded the CommonJS way so a Playwright installed globally (NODE_PATH) works too.
const { chromium } = createRequire(import.meta.url)('playwright');
const SHEETS = mkdtempSync(join(tmpdir(), 'widget-sheets-'));
const OUT = process.argv[2] || 'android/app/src/main/res';

const THEMES = {
  light: { bg: '#FFFFFF', stroke: 'rgba(19,19,32,.08)', tile: '#F3F3F6', text: '#131317', text2: '#5C5C66', text3: '#6E6E78', track: '#E6E6EC', onAccent: '#FFFFFF', accent: '#3D4ED8', good: '#23926A', sleep: '#3B72E0', train: '#D9654E', money: '#C98420', wall: '#cfd6e4' },
  dark: { bg: '#161619', stroke: 'rgba(255,255,255,.08)', tile: '#1F1F24', text: '#F0F0F3', text2: '#A2A2AC', text3: '#868690', track: '#2B2B32', onAccent: '#0C0C0F', accent: '#8A94FF', good: '#4DBB8F', sleep: '#6F9DFF', train: '#EA8A76', money: '#E5A94E', wall: '#1b2233' },
};
const L = {
  en: {
    today: 'Today', date: 'Wed 26 Nov', habits: 'Habits', habitsShort: 'habits', steps: 'Steps', sleep: 'Sleep', training: 'Training', money: 'Money',
    doneOf: '4 of 6 done', ofGoal: 'of 8,000', toGo: '1,580 to go', stepsNum: '6,420', sleepNum: '7h 42m', lastNight: 'last night · 8/10 quality',
    trainNum: '2h 25m', sessions: '4 sessions this week', spent: 'E£12,480', spentCap: 'spent this month', budget: '62% of your budget', safe: 'E£410 a day left to spend',
    habit: 'Habit', workout: 'Workout', expense: 'Expense', days: ['T', 'F', 'S', 'S', 'M', 'T', 'W'], frac: '4/6',
  },
  ar: {
    today: 'اليوم', date: 'الأربعاء 26 نوفمبر', habits: 'العادات', habitsShort: 'عادات', steps: 'الخطوات', sleep: 'النوم', training: 'التمرين', money: 'المال',
    doneOf: 'أُنجز 4 من 6', ofGoal: 'من 8,000', toGo: 'باقٍ 1,580', stepsNum: '6,420', sleepNum: '7 س 42 د', lastNight: 'الليلة الماضية · الجودة 8/10',
    trainNum: '2 س 25 د', sessions: '4 تمارين هذا الأسبوع', spent: '12,480 ج.م', spentCap: 'أُنفق هذا الشهر', budget: '62% من ميزانيتك', safe: 'متاح 410 ج.م يوميًا للإنفاق',
    habit: 'عادة', workout: 'تمرين', expense: 'مصروف', days: ['خ', 'ج', 'س', 'ح', 'ن', 'ث', 'ر'], frac: '4/6',
  },
};
const ICON = {
  habit: (c) => `<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M8 12.3l2.8 2.7 5.2-5.4" fill="none" stroke="${c.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  steps: (c) => `<svg viewBox="0 0 24 24"><path fill="${c.accent}" d="M8.2 3c1.9 0 3.1 1.9 3 4.4-.1 2.2-1 4-1.2 5.3l-4.6.8C5 12 4.4 10.4 4.6 8 4.8 5.2 6.3 3 8.2 3zM5.7 15l4.5-.8c.3 2.1-.4 4-2.1 4.3-1.6.3-2.3-1.3-2.4-3.5zM15.8 6c1.9 0 3.4 2.2 3.6 5 .2 2.4-.4 4-.8 5.5l-4.6-.8c-.2-1.3-1.1-3.1-1.2-5.3-.1-2.5 1.1-4.4 3-4.4zM13.8 17.2l4.5.8c-.1 2.2-.8 3.8-2.4 3.5-1.7-.3-2.4-2.2-2.1-4.3z"/></svg>`,
  sleep: (c) => `<svg viewBox="0 0 24 24"><path fill="${c.sleep}" d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1z"/></svg>`,
  train: (c) => `<svg viewBox="0 0 24 24"><path d="M4 9.5v5M7 7.5v9M17 7.5v9M20 9.5v5M7 12h10" fill="none" stroke="${c.train}" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  money: (c) => `<svg viewBox="0 0 24 24"><path d="M4 7h14q2 0 2 2v8q0 2-2 2H6q-2 0-2-2zM4 7V6q0-1.5 1.5-1.5H15" fill="none" stroke="${c.money}" stroke-width="2" stroke-linejoin="round"/><circle cx="16" cy="13" r="1.5" fill="${c.money}"/></svg>`,
};
const ring = (size, f, color, track) => {
  const sw = size * 0.1, r = (size - sw) / 2, C = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${sw}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
};
const bars = (w, h, vals, labels, color, c, rtl) => {
  const n = vals.length, labelH = 15, chartH = h - labelH, slot = w / n, bw = Math.min(slot * 0.58, 20), max = Math.max(...vals);
  let s = '';
  vals.forEach((v, i) => {
    const pos = rtl ? n - 1 - i : i, cx = slot * pos + slot / 2, last = i === n - 1;
    const bh = v > 0 ? Math.max(4, (v / max) * (chartH - 2)) : 3;
    s += `<rect x="${cx - bw / 2}" y="${chartH - bh}" width="${bw}" height="${bh}" rx="${Math.min(bw / 2, 6)}" fill="${v > 0 ? color : c.track}" fill-opacity="${v > 0 && !last ? 0.4 : 1}"/>`;
    s += `<text x="${cx}" y="${h - 3}" text-anchor="middle" font-size="10.5" font-weight="500" fill="${last ? color : c.text3}">${labels[i]}</text>`;
  });
  return `<svg width="${w}" height="${h}">${s}</svg>`;
};

const page = (c, t, rtl) => `<!doctype html><html dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:${c.wall};font-family:Inter,'DejaVu Sans',sans-serif;display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
  .w{background:${c.bg};border:1px solid ${c.stroke};border-radius:24px;padding:16px;box-sizing:border-box;display:flex;flex-direction:column;color:${c.text};overflow:hidden}
  .s2{width:170px;height:170px}.s4{width:352px;height:170px}.q{width:352px;height:76px;padding:8px;flex-direction:row;gap:6px}
  .hd{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${c.text2}}.hd svg{width:16px;height:16px}
  .ringbox{flex:1;position:relative;display:flex;align-items:center;justify-content:center;margin-top:6px}
  .mid{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
  .big{font-size:22px;font-weight:600;letter-spacing:-.01em}.sub{font-size:11px;color:${c.text3}}
  .cap{font-size:12px;font-weight:500;color:${c.text2};margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .val{font-size:26px;font-weight:600;margin-top:6px;letter-spacing:-.01em}.c2{font-size:12px;color:${c.text2};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tile{flex:1;background:${c.tile};border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:12px;font-weight:600}.tile svg{width:20px;height:20px}
  .row{display:flex;align-items:center;gap:8px;flex:1}.row svg{width:18px;height:18px}.row .l{flex:1;font-size:13px;color:${c.text2}}.row .v{font-size:15px;font-weight:600}
</style></head><body>
  <div class="w s4" id="today">
    <div style="display:flex;align-items:center"><div style="flex:1;font-size:15px;font-weight:600">${t.today}</div><div style="font-size:12px;color:${c.text3}">${t.date}</div></div>
    <div style="flex:1;display:flex;align-items:center;margin-top:8px;gap:16px">
      <div style="flex:.8;position:relative;height:100%;display:flex;align-items:center;justify-content:center">${ring(104, 4 / 6, c.accent, c.track)}<div class="mid"><div style="font-size:20px;font-weight:600">${t.frac}</div><div class="sub">${t.habitsShort}</div></div></div>
      <div style="flex:1.6;display:flex;flex-direction:column;height:100%">
        <div class="row">${ICON.steps(c)}<span class="l">${t.steps}</span><span class="v">${t.stepsNum}</span></div>
        <div class="row">${ICON.sleep(c)}<span class="l">${t.sleep}</span><span class="v">${t.sleepNum}</span></div>
        <div class="row">${ICON.money(c)}<span class="l">${t.money}</span><span class="v">${t.spent}</span></div>
      </div>
    </div>
  </div>
  <div class="w s2" id="habits"><div class="hd">${ICON.habit(c)}${t.habits}</div>
    <div class="ringbox">${ring(92, 4 / 6, c.accent, c.track)}<div class="mid"><div class="big">${t.frac}</div><div class="sub">${t.habitsShort}</div></div></div>
    <div class="cap">${t.doneOf}</div></div>
  <div class="w s2" id="steps"><div class="hd">${ICON.steps(c)}${t.steps}</div>
    <div class="ringbox">${ring(86, 6420 / 8000, c.accent, c.track)}<div class="mid"><div class="big">${t.stepsNum}</div><div class="sub">${t.ofGoal}</div></div></div>
    <div class="cap" style="text-align:center">${t.toGo}</div></div>
  <div class="w s2" id="sleep"><div class="hd">${ICON.sleep(c)}${t.sleep}</div><div class="val">${t.sleepNum}</div><div class="c2">${t.lastNight}</div>
    <div style="flex:1;margin-top:8px;display:flex;align-items:flex-end">${bars(138, 54, [6.8, 7.4, 6.1, 8.2, 7.0, 6.5, 7.7], t.days, c.sleep, c, rtl)}</div></div>
  <div class="w s2" id="training"><div class="hd">${ICON.train(c)}${t.training}</div><div class="val">${t.trainNum}</div><div class="c2">${t.sessions}</div>
    <div style="flex:1;margin-top:8px;display:flex;align-items:flex-end">${bars(138, 54, [45, 0, 30, 0, 40, 0, 30], t.days, c.train, c, rtl)}</div></div>
  <div class="w s2" id="money"><div class="hd">${ICON.money(c)}${t.money}</div><div style="flex:1"></div>
    <div style="font-size:24px;font-weight:600;letter-spacing:-.01em">${t.spent}</div><div class="c2">${t.spentCap}</div>
    <div style="height:8px;border-radius:4px;background:${c.track};margin-top:10px;position:relative"><div style="position:absolute;inset-inline-start:0;top:0;bottom:0;width:62%;border-radius:4px;background:${c.money}"></div></div>
    <div class="c2" style="margin-top:6px">${t.budget}</div><div style="font-size:12px;color:${c.text3};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.safe}</div><div style="flex:1"></div></div>
  <div class="w q" id="quick">
    <div class="tile">${ICON.habit(c)}${t.habit}</div><div class="tile">${ICON.train(c)}${t.workout}</div><div class="tile">${ICON.sleep(c)}${t.sleep}</div><div class="tile">${ICON.money(c)}${t.expense}</div>
  </div>
</body></html>`;

const b = await chromium.launch();
for (const [lang, t] of Object.entries(L)) {
  for (const [theme, c] of Object.entries(THEMES)) {
    const dir = `${OUT}/drawable${lang === 'ar' ? '-ar' : ''}${theme === 'dark' ? '-night' : ''}-nodpi`;
    mkdirSync(dir, { recursive: true });
    const ctx = await b.newContext({ deviceScaleFactor: 3, viewport: { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    await p.setContent(page(c, t, lang === 'ar'));
    await p.waitForTimeout(300);
    // Transparent round the card, so the preview sits on the picker's own background.
    await p.evaluate(() => (document.body.style.background = 'transparent'));
    for (const id of ['today', 'habits', 'steps', 'sleep', 'training', 'money', 'quick']) {
      await p.locator('#' + id).screenshot({ path: `${dir}/w_preview_${id}.png`, omitBackground: true });
    }
    // A sheet of all of them, to look at.
    await p.evaluate((w) => (document.body.style.background = w), c.wall);
    await p.screenshot({ path: `${SHEETS}/sheet-${lang}-${theme}.png` });
    await ctx.close();
  }
}
await b.close();
console.log(`Previews written; sheets in ${SHEETS}`);
