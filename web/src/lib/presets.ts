// Ready-made habits and counters offered as one-tap suggestions in the add
// sheets, so new users aren't staring at an empty form. Tapping a preset just
// fills the form fields — everything stays editable before saving. Names come
// in the reader's language, since once saved they're the person's own.

import { t } from '../i18n';

export interface HabitPreset {
  name: string;
  color: string; // teal | indigo | coral | blue | emerald
  days: string; // 7-char Sun..Sat mask
}

export const HABIT_PRESETS: HabitPreset[] = [
  { name: t('Drink water'), color: 'blue', days: '1111111' },
  { name: t('Exercise'), color: 'coral', days: '1111111' },
  { name: t('Read'), color: 'indigo', days: '1111111' },
  { name: t('Meditate'), color: 'teal', days: '1111111' },
  { name: t('Walk'), color: 'teal', days: '1111111' },
  { name: t('Journal'), color: 'indigo', days: '1111111' },
  { name: t('Sleep 8 hours'), color: 'blue', days: '1111111' },
  { name: t('Stretch'), color: 'coral', days: '1111111' },
  { name: t('No sugar'), color: 'emerald', days: '1111111' },
];

export interface CounterPreset {
  name: string;
  unit: string;
  icon: string; // must be a key in CTR_ICONS (lib/iconPaths)
  color: string;
  step: number;
}

export const COUNTER_PRESETS: CounterPreset[] = [
  { name: t('Water'), unit: t('cups'), icon: 'drop', color: 'blue', step: 1 },
  { name: t('Push-ups'), unit: t('reps'), icon: 'reps', color: 'coral', step: 5 },
  { name: t('Pages read'), unit: t('pages'), icon: 'book', color: 'indigo', step: 5 },
  { name: t('Coffee'), unit: t('cups'), icon: 'cup', color: 'coral', step: 1 },
  { name: t('Steps'), unit: t('steps'), icon: 'bolt', color: 'teal', step: 10 },
  { name: t('Meditate'), unit: t('min'), icon: 'heart', color: 'teal', step: 5 },
];
