import React, { useRef, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useStore, useData, PRESET_NAMES, presetHex } from '../store';
import { api, setToken } from '../api';
import { CODES, POPULAR, currencyName } from '@core/lib/currencies';
import { getDigits, setDigits } from '@core/i18n';
import { t, getLang, setLangPref } from '../i18n';
import { Avatar, Button, Dialog, Field, FormFoot, Seg, Switch } from '../ui/kit';
import { Icon, type IconName } from '../ui/Icon';
import { exportCsv, type ExportKind } from '../lib/exports';
import { switchToPhone } from '../layout/nav';

// Settings in sections down the side, the way desktop apps do it. The same
// page, trimmed, is the first thing a new account sees on the website.

const MODULES: [string, string, string, IconName][] = [
  ['habits', 'Habits', 'Things you want to do most days', 'habits'],
  ['workouts', 'Workouts', 'Runs, gym sessions, matches', 'fitness'],
  ['sleep', 'Sleep', 'When you went to bed and woke up', 'sleep'],
  ['finances', 'Money', 'Spending, accounts, budgets and bills', 'money'],
  ['todos', 'Tasks', 'To-do lists with due dates', 'tasks'],
  ['counters', 'Counters', 'Pages read, glasses of water, reps', 'counter'],
];
const ALL = MODULES.map((m) => m[0]);

const SECTIONS: [string, string, IconName][] = [
  ['profile', 'Profile', 'user'],
  ['appearance', 'Appearance', 'palette'],
  ['region', 'Language and currency', 'globe'],
  ['trackers', 'What you track', 'toggles'],
  ['security', 'Password and sign-in', 'lock'],
  ['data', 'Your data', 'database'],
];

export function Settings({ setup }: { setup?: boolean }) {
  const { section = 'profile' } = useParams();
  if (setup) return <Setup />;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('Settings')}</h1>
          <div className="page-sub">{t('These follow your account, on the website and on your phone.')}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr)', gap: 32, alignItems: 'start' }}>
        <nav className="settings-nav" style={{ position: 'sticky', top: 80, display: 'grid', gap: 2 }}>
          {SECTIONS.map(([k, label, icon]) => (
            <NavLink key={k} to={`/settings/${k}`} className={() => (section === k ? 'active' : '')}>
              <Icon name={icon} size={16} />
              {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="card" style={{ padding: '8px 24px 8px' }}>
          {section === 'appearance' ? <Appearance /> : section === 'region' ? <Region /> : section === 'trackers' ? <Trackers /> : section === 'security' ? <Security /> : section === 'data' ? <Data /> : <Profile />}
        </div>
      </div>
    </div>
  );
}

const Row = ({ title, sub, children }: { title: string; sub?: React.ReactNode; children: React.ReactNode }) => (
  <div className="setting-row">
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600 }}>{title}</div>
      {sub && <div className="faint" style={{ fontSize: 14, marginTop: 2 }}>{sub}</div>}
    </div>
    <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
  </div>
);

function useProfile() {
  const { mutate } = useStore();
  return (patch: Partial<ReturnType<typeof useData>['profile']>, done?: string) => mutate((st) => ({ ...st, profile: { ...st.profile, ...patch } }), () => api.updateMe(patch), done);
}

function Profile() {
  const s = useData();
  const save = useProfile();
  const { mutate, toast } = useStore();
  const [name, setName] = useState(s.profile.name);
  const [email, setEmail] = useState(s.profile.email);
  const file = useRef<HTMLInputElement>(null);
  const pick = (f: File) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const n = 256;
      const k = Math.max(n / img.width, n / img.height);
      c.width = n;
      c.height = n;
      c.getContext('2d')!.drawImage(img, (n - img.width * k) / 2, (n - img.height * k) / 2, img.width * k, img.height * k);
      save({ avatar: c.toDataURL('image/jpeg', 0.85) }, t('Photo updated'));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  };
  return (
    <>
      <Row title={t('Photo')} sub={t('Shown in the corner, and to a partner if you have one.')}>
        <Avatar name={s.profile.name} src={s.profile.avatar} size={44} />
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        <Button size="sm" onClick={() => file.current?.click()}>{t('Upload')}</Button>
        {s.profile.avatar && <Button size="sm" kind="ghost" onClick={() => save({ avatar: null }, t('Photo removed'))}>{t('Remove')}</Button>}
      </Row>
      <form className="setting-row" onSubmit={(e) => (e.preventDefault(), name.trim() && save({ name: name.trim() }, t('Saved')))} style={{ alignItems: 'flex-end' }}>
        <Field label={t('Name')} style={{ flex: 1 }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Button type="submit" disabled={name.trim() === s.profile.name || !name.trim()}>{t('Save')}</Button>
      </form>
      <form className="setting-row" onSubmit={(e) => (e.preventDefault(), email.trim() && save({ email: email.trim() }, t('Saved')))} style={{ alignItems: 'flex-end' }}>
        <Field label={t('Email')} style={{ flex: 1 }} hint={s.profile.emailVerified ? t('Confirmed') : t('Not confirmed yet. Confirming makes password resets reliable.')}>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {!s.profile.emailVerified && (
          <Button kind="ghost" onClick={() => mutate(null, async () => (await api.sendVerify(), api.state()), t('Check your inbox for the link'))}>
            {t('Send link')}
          </Button>
        )}
        <Button type="submit" disabled={email.trim() === s.profile.email}>{t('Save')}</Button>
      </form>
      <Row title={t('Member since')}>
        <span className="muted">{s.profile.createdAt ? new Date(s.profile.createdAt).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</span>
      </Row>
      <Row title={t('Phone layout')} sub={t('Prefer the phone app’s layout on this computer? You can switch back from its menu.')}>
        <Button size="sm" icon="phone" onClick={() => (toast(t('Switching…')), switchToPhone())}>{t('Use the phone layout')}</Button>
      </Row>
    </>
  );
}

function Appearance() {
  const s = useData();
  const save = useProfile();
  const { theme } = useStore();
  const custom = s.profile.accent?.startsWith('#') ? s.profile.accent : null;
  return (
    <>
      <Row title={t('Theme')} sub={t('System follows your computer’s setting.')}>
        <Seg value={s.profile.theme} onChange={(v) => save({ theme: v })} options={[['system', t('System')], ['light', t('Light')], ['dark', t('Dark')]]} />
      </Row>
      <Row title={t('Accent colour')} sub={t('Used for buttons, charts and what’s selected, here and on your phone.')}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', maxWidth: 360, justifyContent: 'flex-end' }}>
          {PRESET_NAMES.map((n) => {
            const on = (s.profile.accent || 'indigo') === n;
            const c = presetHex(n, theme);
            return <span key={n} role="radio" aria-checked={on} aria-label={n} tabIndex={0} className={`swatch${on ? ' on' : ''}`} style={{ background: c, color: c }} onClick={() => save({ accent: n })} onKeyDown={(e) => e.key === 'Enter' && save({ accent: n })} />;
          })}
          <label className={`swatch${custom ? ' on' : ''}`} title={t('Any colour')} style={{ background: custom || 'conic-gradient(#f87171, #fbbf24, #4ade80, #60a5fa, #a78bfa, #f87171)', color: custom || 'var(--text-3)', position: 'relative', overflow: 'hidden' }}>
            <input type="color" value={custom || '#8b93ff'} onChange={(e) => save({ accent: e.target.value })} style={{ opacity: 0, position: 'absolute', inset: 0, cursor: 'pointer' }} />
          </label>
        </div>
      </Row>
    </>
  );
}

function Region() {
  const s = useData();
  const save = useProfile();
  const ar = getLang() === 'ar';
  const codes = [...POPULAR, ...CODES.filter((c: string) => !POPULAR.includes(c))];
  return (
    <>
      <Row title={t('Language')} sub={t('For this browser. The page reloads to switch.')}>
        <select className="select" style={{ width: 200 }} value={getLang()} onChange={(e) => setLangPref(e.target.value as 'en' | 'ar')}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </Row>
      {ar && (
        <Row title={t('Digits')}>
          <Seg value={getDigits()} onChange={setDigits} options={[['latn', '123'], ['arab', '١٢٣']]} />
        </Row>
      )}
      <Row title={t('Currency')} sub={t('What amounts are shown in. Changing it doesn’t convert anything.')}>
        <select className="select" style={{ width: 280 }} value={s.profile.currency} onChange={(e) => save({ currency: e.target.value }, t('Saved'))}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c} · {currencyName(c, ar ? 'ar' : 'en')}
            </option>
          ))}
        </select>
      </Row>
    </>
  );
}

function ModuleToggles({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
      {MODULES.map(([k, label, sub, icon]) => {
        const on = value.includes(k);
        const flip = () => {
          const next = on ? value.filter((x) => x !== k) : [...value, k];
          if (next.length) onChange(next);
        };
        return (
          <div key={k} className="card" role="checkbox" aria-checked={on} tabIndex={0} onClick={flip} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), flip())} style={{ padding: '16px 16px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', borderColor: on ? 'var(--accent-line)' : undefined, background: on ? 'color-mix(in srgb, var(--accent) 6%, var(--panel))' : undefined }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--accent-soft)' : 'var(--panel-2)', color: on ? 'var(--accent)' : 'var(--text-3)' }}>
              <Icon name={icon} size={17} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>{t(label)}</span>
              <span className="faint" style={{ fontSize: 12 }}>{t(sub)}</span>
            </span>
            <Switch on={on} onChange={flip} label={t(label)} />
          </div>
        );
      })}
    </div>
  );
}

function Trackers() {
  const s = useData();
  const save = useProfile();
  const value = s.profile.modules || ALL;
  return (
    <div style={{ padding: '16px 0' }}>
      <div className="muted" style={{ marginBottom: 16 }}>{t('Turn off what you don’t use: it leaves the menus and the overview. Nothing is deleted.')}</div>
      <ModuleToggles value={value} onChange={(v) => save({ modules: v.length === ALL.length ? null : v })} />
    </div>
  );
}

function Security() {
  const { toast } = useStore();
  const [pw, setPw] = useState(false);
  return (
    <>
      <Row title={t('Password')} sub={t('If you signed up with Google, use “Forgot it?” on the sign-in page to set one.')}>
        <Button size="sm" onClick={() => setPw(true)}>{t('Change password')}</Button>
      </Row>
      <Row title={t('Other devices')} sub={t('Signs out every other browser and phone. This one stays signed in.')}>
        <Button
          size="sm"
          onClick={async () => {
            try {
              const r = await api.signOutOthers();
              setToken(r.token);
              toast(t('Signed out everywhere else'));
            } catch (e) {
              toast(e instanceof Error ? e.message : t('That didn’t work'), { bad: true });
            }
          }}
        >
          {t('Sign out other devices')}
        </Button>
      </Row>
      {pw && <PasswordDialog onClose={() => setPw(false)} />}
    </>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useStore();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={t('Change password')}
      onClose={onClose}
      onSubmit={async () => {
        setBusy(true);
        try {
          await api.changePassword(cur, next);
          toast(t('Password changed'));
          onClose();
        } catch (e) {
          setErr(e instanceof Error ? e.message : t('That didn’t work'));
        }
        setBusy(false);
      }}
      footer={<FormFoot onCancel={onClose} busy={busy} saveLabel={t('Change password')} />}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <Field label={t('Current password')}>
          <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />
        </Field>
        <Field label={t('New password')} hint={t('At least 8 characters.')}>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        </Field>
        {err && <div style={{ color: 'var(--bad)', fontSize: 14 }}>{err}</div>}
      </div>
    </Dialog>
  );
}

function Data() {
  const s = useData();
  const { toast, replace, signOut } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [del, setDel] = useState(false);
  const json = async () => {
    try {
      const data = await api.exportAll();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbit-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('That didn’t work'), { bad: true });
    }
  };
  const csv = async (k: ExportKind) => toast(t('{n} rows saved', { n: await exportCsv(k, s) }));
  const restore = async (f: File) => {
    try {
      const r = await api.importData(JSON.parse(await f.text()));
      replace(r.state);
      toast(t('Added {n} entries', { n: r.added }));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('That file couldn’t be read'), { bad: true });
    }
  };
  return (
    <>
      <Row title={t('Download everything')} sub={t('Your whole history in one file, readable by any program.')}>
        <Button size="sm" icon="download" onClick={json}>JSON</Button>
      </Row>
      <Row title={t('Spreadsheets')} sub={t('Open in Excel, Numbers or Google Sheets.')}>
        <Button size="sm" onClick={() => csv('txns')}>{t('Transactions')}</Button>
        <Button size="sm" onClick={() => csv('workouts')}>{t('Workouts')}</Button>
        <Button size="sm" onClick={() => csv('sleep')}>{t('Sleep')}</Button>
        <Button size="sm" onClick={() => csv('habits')}>{t('Habits')}</Button>
      </Row>
      <Row title={t('Bring back an export')} sub={t('Adds what’s missing from an Orbit JSON file. Never deletes anything.')}>
        <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
        <Button size="sm" icon="upload" onClick={() => file.current?.click()}>{t('Choose file')}</Button>
      </Row>
      <Row title={t('Delete your account')} sub={t('Everything goes, on every device, for good. Download it first if you want to keep it.')}>
        <Button size="sm" kind="danger" onClick={() => setDel(true)}>{t('Delete account')}</Button>
      </Row>
      {del && <DeleteDialog onClose={() => setDel(false)} done={signOut} />}
    </>
  );
}

function DeleteDialog({ onClose, done }: { onClose: () => void; done: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  return (
    <Dialog
      title={t('Delete your account?')}
      onClose={onClose}
      onSubmit={async () => {
        try {
          await api.deleteMe(pw);
          done();
        } catch (e) {
          setErr(e instanceof Error ? e.message : t('That didn’t work'));
        }
      }}
      footer={
        <>
          <span className="spacer" />
          <Button kind="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button kind="danger solid" type="submit">{t('Delete everything')}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div className="muted">{t('Your habits, workouts, sleep, money and tasks are deleted from Orbit’s server. This can’t be undone.')}</div>
        <Field label={t('Your password, to confirm')}>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </Field>
        {err && <div style={{ color: 'var(--bad)', fontSize: 14 }}>{err}</div>}
      </div>
    </Dialog>
  );
}

function Setup() {
  const s = useData();
  const { mutate } = useStore();
  const nav = useNavigate();
  const [mods, setMods] = useState<string[]>(s.profile.modules || ALL);
  const [currency, setCurrency] = useState(s.profile.currency || 'EGP');
  const ar = getLang() === 'ar';
  const codes = [...POPULAR, ...CODES.filter((c: string) => !POPULAR.includes(c))];
  const go = async () => {
    const patch = { modules: mods.length === ALL.length ? null : mods, currency };
    await mutate((st) => ({ ...st, profile: { ...st.profile, ...patch } }), () => api.updateMe(patch));
    nav('/', { replace: true });
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div style={{ textAlign: 'center', margin: '24px 0 32px' }}>
        <h1 className="page-title" style={{ fontSize: 28 }}>{t('Welcome to Orbit, {name}', { name: s.profile.name.split(' ')[0] || '' })}</h1>
        <div className="page-sub" style={{ fontSize: 16 }}>{t('Two quick choices and you’re in. Both can be changed later in Settings.')}</div>
      </div>
      <div className="label" style={{ marginBottom: 8 }}>{t('What do you want to keep track of?')}</div>
      <ModuleToggles value={mods} onChange={setMods} />
      <div className="label" style={{ margin: '24px 0 8px' }}>{t('Your currency')}</div>
      <select className="select" style={{ maxWidth: 320 }} value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {codes.map((c) => (
          <option key={c} value={c}>
            {c} · {currencyName(c, ar ? 'ar' : 'en')}
          </option>
        ))}
      </select>
      <div className="row" style={{ marginTop: 32, justifyContent: 'flex-end' }}>
        <Button kind="primary" onClick={go} style={{ height: 40, padding: '0 24px' }}>
          {t('Start using Orbit')}
        </Button>
      </div>
    </div>
  );
}
