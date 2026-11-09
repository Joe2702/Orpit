import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import { t, getLang, setLangPref } from '../../i18n';
import { Button, Field } from '../../ui/kit';
import { Icon, type IconName } from '../../ui/Icon';

// Signing in, signing up and getting back in, on a big screen: the product on
// one side, the form on the other.

const GOOGLE = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function GoogleSignIn() {
  const ref = useRef<HTMLDivElement>(null);
  const { signedIn, toast } = useStore();
  const nav = useNavigate();
  useEffect(() => {
    if (!GOOGLE) return;
    const draw = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !ref.current) return false;
      g.accounts.id.initialize({
        client_id: GOOGLE,
        callback: async (r: { credential: string }) => {
          try {
            signedIn(await api.google(r.credential));
            nav('/');
          } catch (e) {
            toast(e instanceof Error ? e.message : t('Google sign-in failed'), { bad: true });
          }
        },
      });
      g.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'rectangular', width: ref.current.clientWidth || 360, locale: getLang() });
      return true;
    };
    if (draw()) return;
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client';
    sc.async = true;
    sc.onload = () => draw();
    document.head.appendChild(sc);
  }, [signedIn, nav, toast]);
  if (!GOOGLE) return null;
  return (
    <>
      <div className="row" style={{ gap: 12, margin: '6px 0' }}>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
        <span className="faint" style={{ fontSize: 12 }}>{t('or')}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
      </div>
      <div ref={ref} style={{ minHeight: 44, width: '100%' }} />
    </>
  );
}

function Showcase() {
  const points: [IconName, string, string][] = [
    ['habits', t('Habits that stick'), t('A week at a glance, streaks that forgive one bad day, a year of check-ins on one screen.')],
    ['money', t('Money, down to the pound'), t('Every account and budget, with your bank texts read for you on Android.')],
    ['fitness', t('Training and sleep'), t('See how the hours you sleep and the time you train move together.')],
    ['keyboard', t('Built for a keyboard'), t('Search everything with Ctrl K. Log anything in two keystrokes.')],
  ];
  // A small, made-up week to show what the charts look like.
  const bars = [0.55, 0.8, 0.35, 0.9, 0.7, 1, 0.62];
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: '#0a0a0f', color: '#f4f4f5', padding: '48px 56px', display: 'flex', flexDirection: 'column' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(60% 50% at 80% 10%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%), radial-gradient(50% 40% at 10% 90%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%)' }} />
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '44px 44px', maskImage: 'radial-gradient(70% 60% at 50% 40%, #000, transparent)' }} />
      <div className="brand" style={{ position: 'relative', color: '#fff' }}>
        <span className="brand-mark" style={{ borderColor: '#fff' }} />
        Orbit
      </div>
      <div style={{ position: 'relative', marginTop: 'auto', maxWidth: 520 }}>
        <h1 style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: '-0.03em', fontWeight: 700, margin: 0 }}>{t('Your habits, health and money, on the big screen.')}</h1>
        <p style={{ color: 'rgba(244,244,245,.65)', fontSize: 15.5, lineHeight: 1.6, margin: '16px 0 0' }}>{t('The same account as the Orbit app on your phone. Whatever you log here is on your phone a moment later, and the other way round.')}</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, marginTop: 36 }}>
          {points.map(([ic, h, p]) => (
            <div key={h}>
              <div className="row" style={{ gap: 9, fontWeight: 620 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,.07)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                  <Icon name={ic} size={15} />
                </span>
                {h}
              </div>
              <div style={{ color: 'rgba(244,244,245,.58)', fontSize: 13, lineHeight: 1.55, marginTop: 7 }}>{p}</div>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden style={{ position: 'relative', marginTop: 40, display: 'flex', gap: 14 }}>
        <div style={{ flex: 1, borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', padding: 16 }}>
          <div style={{ fontSize: 11.5, color: 'rgba(244,244,245,.55)' }}>{t('Habits this week')}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 54, marginTop: 10 }}>
            {bars.map((b, i) => (
              <span key={i} style={{ flex: 1, height: `${b * 100}%`, borderRadius: '3px 3px 0 0', background: i === 6 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 50%, transparent)' }} />
            ))}
          </div>
        </div>
        <div style={{ flex: 1, borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', padding: 16 }}>
          <div style={{ fontSize: 11.5, color: 'rgba(244,244,245,.55)' }}>{t('Left to spend today')}</div>
          <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 8 }} className="num">
            {getLang() === 'ar' ? '٨٠٠ ج.م' : 'E£800'}
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,.1)', marginTop: 10 }}>
            <div style={{ width: '62%', height: '100%', borderRadius: 3, background: 'var(--accent)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Auth() {
  const { page = 'signin' } = useParams();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'minmax(0, 1.1fr) minmax(420px, 1fr)' }} className="auth-split">
      <style>{`@media (max-width: 960px) { .auth-split { grid-template-columns: 1fr !important; } .auth-split > div:first-child { display: none !important; } }`}</style>
      <Showcase />
      <div style={{ display: 'flex', flexDirection: 'column', padding: '28px 40px' }}>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost sm" onClick={() => setLangPref(getLang() === 'ar' ? 'en' : 'ar')}>
            <Icon name="globe" size={14} />
            {getLang() === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 380 }}>
            {page === 'signup' ? <SignUp /> : page === 'forgot' ? <Forgot /> : page === 'reset' ? <Reset /> : page === 'verify' ? <Verify /> : <SignIn />}
          </div>
        </div>
        <div className="faint" style={{ fontSize: 12, textAlign: 'center' }}>
          <a href="/privacy" className="link" style={{ fontSize: 12, color: 'var(--text-3)' }}>
            {t('Privacy')}
          </a>
        </div>
      </div>
    </div>
  );
}

const Head = ({ title, sub }: { title: string; sub?: React.ReactNode }) => (
  <div style={{ marginBottom: 26 }}>
    <h2 style={{ fontSize: 26, fontWeight: 680, letterSpacing: '-0.025em', margin: 0 }}>{title}</h2>
    {sub && <div className="muted" style={{ marginTop: 6 }}>{sub}</div>}
  </div>
);
const Err = ({ msg }: { msg: string }) => (msg ? <div style={{ color: 'var(--bad)', fontSize: 13 }}>{msg}</div> : null);

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error && e.message !== 'offline' ? e.message : t('Can’t reach Orbit. Check your connection and try again.'));
    }
    setBusy(false);
  };
  return { busy, err, go };
}

function SignIn() {
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, err, go } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(async () => {
          signedIn(await api.login(email.trim(), password));
          nav(qs.get('next') || '/', { replace: true });
        });
      }}
      style={{ display: 'grid', gap: 16 }}
    >
      <Head title={t('Welcome back')} sub={t('Sign in to your Orbit account.')} />
      <Field label={t('Email')}>
        <input className="input lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Field
        label={
          <span className="row">
            {t('Password')}
            <span className="spacer" />
            <Link to="/forgot" className="link" style={{ fontSize: 12.5 }}>
              {t('Forgot it?')}
            </Link>
          </span>
        }
      >
        <input className="input lg" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Err msg={err} />
      <Button kind="primary" type="submit" disabled={busy} style={{ height: 42 }}>
        {busy ? t('Signing in…') : t('Sign in')}
      </Button>
      <GoogleSignIn />
      <div className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        {t('New to Orbit?')}{' '}
        <Link to="/signup" className="link">
          {t('Create an account')}
        </Link>
      </div>
    </form>
  );
}

function SignUp() {
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, err, go } = useSubmit();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(async () => {
          signedIn(await api.signup(email.trim(), password, name.trim()));
          nav('/welcome', { replace: true });
        });
      }}
      style={{ display: 'grid', gap: 16 }}
    >
      <Head title={t('Create your account')} sub={t('Free. Works on the web and on your phone.')} />
      <Field label={t('Your name')}>
        <input className="input lg" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
      </Field>
      <Field label={t('Email')}>
        <input className="input lg" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label={t('Password')} hint={t('At least 8 characters.')}>
        <input className="input lg" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <Err msg={err} />
      <Button kind="primary" type="submit" disabled={busy} style={{ height: 42 }}>
        {busy ? t('Creating…') : t('Create account')}
      </Button>
      <GoogleSignIn />
      <div className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
        {t('Already have an account?')}{' '}
        <Link to="/signin" className="link">
          {t('Sign in')}
        </Link>
      </div>
    </form>
  );
}

function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, err, go } = useSubmit();
  if (sent)
    return (
      <div>
        <Head title={t('Check your email')} sub={t('If an account uses {email}, a link to choose a new password is on its way. It works for an hour.', { email })} />
        <Link to="/signin" className="btn" style={{ width: '100%' }}>
          {t('Back to sign in')}
        </Link>
      </div>
    );
  return (
    <form onSubmit={(e) => (e.preventDefault(), go(async () => (await api.requestReset(email.trim()), setSent(true))))} style={{ display: 'grid', gap: 16 }}>
      <Head title={t('Forgot your password?')} sub={t('We’ll email you a link to choose a new one.')} />
      <Field label={t('Email')}>
        <input className="input lg" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </Field>
      <Err msg={err} />
      <Button kind="primary" type="submit" disabled={busy} style={{ height: 42 }}>
        {t('Send the link')}
      </Button>
      <Link to="/signin" className="link" style={{ textAlign: 'center' }}>
        {t('Back to sign in')}
      </Link>
    </form>
  );
}

function Reset() {
  const { signedIn } = useStore();
  const nav = useNavigate();
  const [qs] = useSearchParams();
  const token = qs.get('token') || '';
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const { busy, err, go } = useSubmit();
  const [mismatch, setMismatch] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== again) return setMismatch(true);
        go(async () => {
          signedIn(await api.resetPassword(token, password));
          nav('/', { replace: true });
        });
      }}
      style={{ display: 'grid', gap: 16 }}
    >
      <Head title={t('Choose a new password')} />
      {!token && <div className="banner">{t('This link is missing its code. Open it again from the email.')}</div>}
      <Field label={t('New password')} hint={t('At least 8 characters.')}>
        <input className="input lg" type="password" autoComplete="new-password" minLength={8} value={password} onChange={(e) => (setPassword(e.target.value), setMismatch(false))} required autoFocus />
      </Field>
      <Field label={t('Type it again')}>
        <input className="input lg" type="password" autoComplete="new-password" value={again} onChange={(e) => (setAgain(e.target.value), setMismatch(false))} required />
      </Field>
      <Err msg={mismatch ? t('The two passwords don’t match.') : err} />
      <Button kind="primary" type="submit" disabled={busy || !token} style={{ height: 42 }}>
        {t('Save and sign in')}
      </Button>
    </form>
  );
}

function Verify() {
  const [qs] = useSearchParams();
  const { status } = useStore();
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait');
  useEffect(() => {
    const token = qs.get('token');
    if (!token) return setState('bad');
    api
      .confirmEmail(token)
      .then(() => setState('ok'))
      .catch(() => setState('bad'));
  }, [qs]);
  return (
    <div>
      <Head
        title={state === 'ok' ? t('Email confirmed') : state === 'bad' ? t('That link didn’t work') : t('Confirming…')}
        sub={state === 'ok' ? t('Thanks. If you ever forget your password, the reset email will reach you.') : state === 'bad' ? t('It may have expired. Send a new one from Settings.') : undefined}
      />
      {state !== 'wait' && (
        <Link to={status === 'in' ? '/' : '/signin'} className="btn primary" style={{ width: '100%', height: 42 }}>
          {status === 'in' ? t('Go to Orbit') : t('Sign in')}
        </Link>
      )}
    </div>
  );
}
