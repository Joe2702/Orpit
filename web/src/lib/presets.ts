// Ready-made habits and counters offered as one-tap suggestions in the add
// sheets, so new users aren't staring at an empty form. Tapping a preset just
// fills the form fields — everything stays editable before saving.

export interface HabitPreset {
  name: string;
  color: string; // teal | indigo | coral | blue | emerald
  days: string; // 7-char Sun..Sat mask
}

export const HABIT_PRESETS: HabitPreset[] = [
  { name: 'Drink water', color: 'blue', days: '1111111' },
  { name: 'Exercise', color: 'coral', days: '1111111' },
  { name: 'Read', color: 'indigo', days: '1111111' },
  { name: 'Meditate', color: 'teal', days: '1111111' },
  { name: 'Walk', color: 'teal', days: '1111111' },
  { name: 'Journal', color: 'indigo', days: '1111111' },
  { name: 'Sleep 8 hours', color: 'blue', days: '1111111' },
  { name: 'Stretch', color: 'coral', days: '1111111' },
  { name: 'No sugar', color: 'emerald', days: '1111111' },
];

export interface CounterPreset {
  name: string;
  unit: string;
  icon: string; // must be a key in CTR_ICONS (lib/iconPaths)
  color: string;
  step: number;
}

export const COUNTER_PRESETS: CounterPreset[] = [
  { name: 'Water', unit: 'cups', icon: 'drop', color: 'blue', step: 1 },
  { name: 'Push-ups', unit: 'reps', icon: 'reps', color: 'coral', step: 5 },
  { name: 'Pages read', unit: 'pages', icon: 'book', color: 'indigo', step: 5 },
  { name: 'Coffee', unit: 'cups', icon: 'cup', color: 'coral', step: 1 },
  { name: 'Steps', unit: 'steps', icon: 'bolt', color: 'teal', step: 10 },
  { name: 'Meditate', unit: 'min', icon: 'heart', color: 'teal', step: 5 },
];
