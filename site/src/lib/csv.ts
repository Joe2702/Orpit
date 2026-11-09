// CSV files from the web app: a table anyone can open in Excel, Numbers or
// Google Sheets. A byte-order mark at the start tells Excel the file is UTF-8,
// so Arabic names come out as Arabic and not as mojibake.

export type Cell = string | number | boolean | null | undefined;

/** One field, quoted only when it has to be. */
export function csvField(v: Cell): string {
  if (v == null) return '';
  const s = String(v);
  // A leading = + - @ makes spreadsheets run the cell as a formula: a shop
  // called "=HYPERLINK(...)" must not become a link that phones home.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return '﻿' + [header, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

/** Hands the file to the browser as a download. Websites only: the phone app has no downloads folder to put it in. */
export function downloadCsv(name: string, csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "2026-11-08 14:05", local time: the form spreadsheets read as a date. */
export function csvDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
