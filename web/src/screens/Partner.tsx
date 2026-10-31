import React from 'react';
import { track } from '../lib/usage';
import { useStore } from '../store';
import { api } from '../api';
import { Avatar, SectionLabel, chip, toggleTrack, toggleKnob } from '../ui';
import { BackButton } from '../ui';
import { Glyph } from '../lib/appIcons';
import {
  SHARE_LEVELS, PARTNER_MODULES, REPORT_REASONS,
  dobPlausible, isAdult, adultOn, ageOn, type ShareLevel,
} from '../lib/partner';
import type { PartnerState, PartnerCard } from '../types';
import { date, t, tn } from '../i18n';

// The accountability partner section.
//
// The screen is one long page rather than a set of tabs, and the order is
// deliberate: what your partner is doing, then what you have said to each other,
// then what you are showing them, then how to leave. It reads top to bottom as
// "here is the relationship, and here is your control over it", and the control
// is never more than one scroll from the thing it controls.
//
// The design problem this feature really has is that its most important state is
// invisible. A person cannot see what their partner sees. So the share controls
// do not use switches — a row of switches tells you something is on but never
// how much — they use a named rung with the consequence written underneath in
// plain words. "They see whether you tracked it — no numbers" is longer than a
// toggle and worth every pixel.

const MODULE_META: Record<string, { label: string; icon: any; color: string }> = {
  habits: { label: t('Habits'), icon: 'sprout', color: 'teal' },
  workouts: { label: t('Workouts'), icon: 'dumbbell', color: 'coral' },
  sleep: { label: t('Sleep'), icon: 'bed', color: 'blue' },
  counters: { label: t('Counters'), icon: 'tally', color: 'indigo' },
  finances: { label: t('Finances'), icon: 'wallet', color: 'emerald' },
};

const card: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'calc(20px * var(--sq))',
  boxShadow: 'var(--shadow)',
  overflow: 'hidden',
};

export function Partner() {
  const { go, showToast, confirm, haptic, open } = useStore();
  const [st, setSt] = React.useState<PartnerState | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => track('partner_open'), []);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setSt(await api.partner());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('Could not load'));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Someone else's activity changes with nothing happening here, so the page
  // re-reads whenever it comes back to the foreground. There is no push channel
  // and adding one for a screen people open occasionally would be a lot of
  // moving parts for a few seconds of freshness.
  React.useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  if (err) {
    return (
      <Shell go={go}>
        <div style={{ ...card, padding: 20, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>
          {err}
          <div role="button" tabIndex={0} onClick={load} className="press99" style={{ marginTop: 14, color: 'var(--indigo)', fontWeight: 700, cursor: 'pointer' }}>
            {t('Try again')}
          </div>
        </div>
      </Shell>
    );
  }
  if (!st) {
    return (
      <Shell go={go}>
        <div style={{ ...card, padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 14 }}>{t('Loading…')}</div>
      </Shell>
    );
  }

  // ---- Not old enough, or we don't know yet ----
  if (!st.eligible) {
    return (
      <Shell go={go}>
        <AgeGate state={st} onSaved={load} showToast={showToast} busy={busy} setBusy={setBusy} />
      </Shell>
    );
  }

  // ---- Eligible, but nobody yet ----
  if (!st.partner) {
    return (
      <Shell go={go}>
        <Matchmaker state={st} reload={load} busy={busy} setBusy={setBusy} showToast={showToast} haptic={haptic} open={open} />
      </Shell>
    );
  }

  const p = st.partner;
  const shared = p.cards.length;

  const setLevel = async (module: string, level: ShareLevel) => {
    haptic();
    // Optimistic: the control has to feel instant, and it is a switch on your
    // own data — if the write fails the reload puts it back where it was.
    setSt((s) => (s?.partner ? { ...s, partner: { ...s.partner, myLevels: { ...s.partner.myLevels, [module]: level } } } : s));
    try {
      await api.setPartnerShare({ module, level });
    } catch {
      showToast(t('Could not save that'));
    }
    load();
  };

  const setChat = async (on: boolean) => {
    haptic();
    try {
      await api.setPartnerShare({ module: 'chat', on });
      load();
    } catch {
      showToast(t('Could not save that'));
    }
  };

  const end = async () => {
    const ok = await confirm({
      title: t('Stop being partners with {name}?', { name: p.name }),
      message:
        t('You will both stop seeing each other’s trackers and messages straight away, and you will not be matched with each other again. If you need to report them, you can still do that for the next 30 days. You can find a new partner whenever you like.'),
      confirmLabel: t('End partnership'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.endPartnership();
      showToast(t('Partnership ended'));
      load();
    } catch {
      showToast(t('That didn’t go through. Try again.'));
    }
    setBusy(false);
  };

  return (
    <Shell go={go}>
      {/* Who */}
      <div style={{ ...card, padding: '18px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <Avatar name={p.name} src={p.avatar} size={52} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 2 }}>
            {t('Partners since {v}', { v: date(p.since, { day: 'numeric', month: 'short' }) })}
          </div>
        </div>
      </div>

      {/* What they're doing */}
      <SectionLabel>{t('{v}’s week', { v: p.name.split(' ')[0] })}</SectionLabel>
      {shared === 0 ? (
        <div style={{ ...card, padding: '20px 18px', marginBottom: 22, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 5 }}>{t('Nothing shared yet')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55 }}>
            {t('{v} hasn’t opened any trackers to you. Sharing one of yours first is usually what gets it going.', { v: p.name.split(' ')[0] })}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          {p.cards.map((c) => (
            <TrackerCard
              key={c.module}
              c={c}
              notes={p.notes.filter((n) => n.module === c.module).length}
              onComment={() => go('partnerThread', { module: c.module })}
            />
          ))}
        </div>
      )}

      {/* Talking */}
      <SectionLabel>{t('Messages')}</SectionLabel>
      <div style={{ ...card, marginBottom: 22 }}>
        <div role="button" tabIndex={0}
          onClick={() => go('partnerThread', { module: null })}
          className="pressRow"
          style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
        >
          <span style={{ width: 36, height: 36, borderRadius: 'calc(10px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="19" height="19" viewBox="0 0 20 20" style={{ fill: 'none', stroke: 'var(--indigo)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
              <path d="M3 5.5h14v9H7l-4 3v-12Z" />
            </svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Open the conversation')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
              {p.notes.length ? tn(p.notes.length, '{n} message', '{n} messages') : t('Nothing yet')}
            </div>
          </div>
          {p.unread > 0 && (
            <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 'calc(11px * var(--sq))', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              {p.unread}
            </span>
          )}
        </div>

        {/* Chat needs both people. Showing whose consent is missing is the
            difference between "off" and "waiting on them", and those feel
            completely different to the person looking at the switch. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px' }}>
          <span style={{ width: 36, flex: 'none' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{t('Free chat')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 1 }}>
              {p.chat.open
                ? t('Open. You can both message freely.')
                : p.chat.mine
                  ? t('Waiting for {v} to turn it on too', { v: p.name.split(' ')[0] })
                  : t('Both of you need to turn this on')}
            </div>
          </div>
          <div role="switch" tabIndex={0} aria-checked={p.chat.mine} aria-label={t('Free chat')} onClick={() => setChat(!p.chat.mine)} style={toggleTrack(p.chat.mine)}>
            <div style={toggleKnob(p.chat.mine)} />
          </div>
        </div>
      </div>

      {/* The control that matters */}
      <SectionLabel>{t('What {v} can see', { v: p.name.split(' ')[0] })}</SectionLabel>
      <div style={{ ...card, marginBottom: 10 }}>
        {PARTNER_MODULES.map((m, i) => (
          <ShareRow
            key={m}
            module={m}
            level={(p.myLevels[m] ?? 0) as ShareLevel}
            onChange={(l) => setLevel(m, l)}
            last={i === PARTNER_MODULES.length - 1}
          />
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 24, padding: '0 2px' }}>
        {t('Changes apply immediately. Turning a tracker off removes it from {v}’s screen the next time it loads. Your finances never include balances or account names at any level — only whether you logged, and what you spent this week.', { v: p.name.split(' ')[0] })}</div>

      {/* Leaving */}
      <div style={{ ...card, marginBottom: 30 }}>
        <div role="button" tabIndex={0} onClick={busy ? undefined : end} className="pressRow" style={{ padding: '15px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          {t('End partnership')}
        </div>
        <div role="button" tabIndex={0} onClick={() => open('partnerReport' as any, { name: p.name, reload: load })} className="pressRow" style={{ padding: '15px 16px', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>
          {t('Report {v}', { v: p.name.split(' ')[0] })}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ go, children }: { go: (s: any) => void; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 20px 28px', animation: 'fadeIn .35s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 20px' }}>
        <BackButton onClick={() => go('settings')} />
        <div className="display" style={{ fontSize: 30, lineHeight: 1.1, color: 'var(--text)' }}>
          {t('Accountability partner')}
        </div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Initials for the last seven days, oldest first — today is the last one. */
function weekLetters(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push(date(d, { weekday: 'narrow' }));
  }
  return out;
}

function TrackerCard({ c, notes, onComment }: { c: PartnerCard; notes: number; onComment: () => void }) {
  const meta = MODULE_META[c.module];
  const col = 'var(--indigo)';
  return (
    <div style={{ ...card, padding: '15px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
        <span style={{ width: 32, height: 32, borderRadius: 'calc(10px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={meta.icon} size={17} color="var(--text2)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{meta.label}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 1 }}>
            {/* Days in the last week, not an unbroken streak: one missed day
                showed a partner "No streak right now", which reads as failure
                to the person it describes and to the person reading it. */}
            {t('{n} of the last 7 days', { n: c.week.filter(Boolean).length })}
            {c.streak >= 3 ? t(' · {streak} in a row', { streak: c.streak }) : ''}
          </div>
        </div>
        {c.today && (
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', color: col, background: `color-mix(in srgb,${col} 14%,transparent)`, borderRadius: 'calc(6px * var(--sq))', padding: '3px 7px', flex: 'none' }}>
            {t('TODAY')}
          </span>
        )}
      </div>

      {/* The week strip. Seven bars says "kept it up" or "fell off on Thursday"
          faster than any number, and it is the whole point of level 1.
          The day letters are not decoration: without them the strip says
          somebody missed a day but not which one, and "you skipped Saturday" is
          the sentence a partner can actually act on. */}
      <div style={{ marginBottom: c.stats?.length || c.level >= 3 ? 13 : 0 }}>
        <div style={{ display: 'flex', gap: 5 }} aria-label={t('Last seven days, oldest first')}>
          {c.week.map((on, i) => (
            <span
              key={i}
              style={{ flex: 1, height: 7, borderRadius: 4, background: on ? col : 'color-mix(in srgb,var(--text2) 20%,transparent)' }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 5, marginTop: 4 }} aria-hidden>
          {weekLetters().map((d, i) => (
            <span
              key={i}
              style={{ flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: '.02em',
                       color: i === 6 ? 'var(--text)' : 'var(--text2)', opacity: i === 6 ? 0.9 : 0.55 }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      {!!c.stats?.length && (
        <div style={{ display: 'flex', gap: 20, marginBottom: c.level >= 3 ? 13 : 0 }}>
          {c.stats.map((s) => (
            <div key={s.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {c.level >= 3 && (
        <div tabIndex={0} onClick={onComment} className="press99" role="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 40, borderRadius: 'calc(12px * var(--sq))', border: '1px solid var(--border)', fontSize: 13.5, fontWeight: 600, color: col, cursor: 'pointer' }}>
          {notes > 0 ? tn(notes, '{n} note', '{n} notes') : t('Leave a note')}
        </div>
      )}
    </div>
  );
}

function ShareRow({
  module, level, onChange, last,
}: { module: string; level: ShareLevel; onChange: (l: ShareLevel) => void; last: boolean }) {
  const meta = MODULE_META[module];
  const col = 'var(--indigo)';
  const [openRow, setOpenRow] = React.useState(false);
  const current = SHARE_LEVELS[level];

  return (
    <div style={{ borderBottom: last ? 'none' : '1px solid var(--border)' }}>
      <div role="button" tabIndex={0}
        onClick={() => setOpenRow((v) => !v)}
        className="pressRow"
        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 16px', cursor: 'pointer' }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 'calc(10px * var(--sq))', flex: 'none', background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={meta.icon} size={17} color="var(--text2)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>{meta.label}</div>
          <div style={{ fontSize: 12.5, color: level ? col : 'var(--text2)', marginTop: 1, fontWeight: level ? 600 : 400 }}>
            {current.label}
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" style={{ fill: 'none', stroke: 'var(--text2)', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', flex: 'none', transform: openRow ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>

      {openRow && (
        <div style={{ padding: '0 16px 14px 63px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {SHARE_LEVELS.map((l) => {
            const on = l.level === level;
            return (
              <div tabIndex={0}
                key={l.level}
                onClick={() => onChange(l.level)}
                className="press99"
                role="button"
                style={{
                  border: `1.5px solid ${on ? col : 'var(--border)'}`,
                  background: on ? `color-mix(in srgb,${col} 10%,transparent)` : 'transparent',
                  borderRadius: 'calc(12px * var(--sq))',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? col : 'var(--text)' }}>{l.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2, lineHeight: 1.45 }}>{l.blurb}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function AgeGate({
  state, onSaved, showToast, busy, setBusy,
}: { state: PartnerState; onSaved: () => void; showToast: (s: string) => void; busy: boolean; setBusy: (b: boolean) => void }) {
  const [dob, setDob] = React.useState('');
  const known = state.dob;

  // Already told us, and simply not old enough yet. Saying which day it opens
  // is kinder and more honest than a flat refusal, and it is knowable.
  if (known) {
    const when = adultOn(known);
    return (
      <div style={{ ...card, padding: '26px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 34, marginBottom: 10 }}>🔒</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('Not just yet')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6 }}>
          {t('Accountability partners match you with someone you don’t know, so it’s for members aged 18 and over. You’re {age}.', { age: ageOn(known) })}
          {when && ' ' + t('This unlocks by itself on {date}.', { date: date(when, { day: 'numeric', month: 'long', year: 'numeric' }) })}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 14, lineHeight: 1.55 }}>
          {t('Everything else in Orbit works exactly the same in the meantime.')}
        </div>
      </div>
    );
  }

  const ok = dobPlausible(dob);
  const adult = ok && isAdult(dob);

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await api.setPartnerIdentity({ dob });
      onSaved();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Could not save that'));
    }
    setBusy(false);
  };

  return (
    <div style={{ ...card, padding: '22px 20px' }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('Your date of birth')}</div>
      <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 18 }}>
        {t('Accountability partners match you with someone you don’t know, so it’s limited to members aged 18 and over. Your date of birth is used for that and nothing else — your partner never sees it or your age.')}
      </div>
      <input
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        className="timeField"
        style={{ width: '100%', height: 52, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', background: 'var(--bg)', padding: '0 16px', fontSize: 16, fontWeight: 600, color: 'var(--text)', outline: 'none', marginBottom: 10 }}
      />
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
        {t('You can only set this once, so please check it.')} {dob && !ok && <span style={{ color: 'var(--danger)' }}>{t('That date doesn’t look right.')}</span>}
        {adult === false && ok && <span style={{ color: 'var(--text2)' }}>{' ' + t('You’ll be able to use this section when you turn 18.')}</span>}
      </div>
      <div tabIndex={0}
        onClick={ok && !busy ? save : undefined}
        className={ok ? 'press99' : undefined}
        role="button"
        aria-disabled={!ok}
        style={{
          height: 52, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15.5, fontWeight: 700, cursor: ok ? 'pointer' : 'default', color: '#fff',
          background: ok ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))',
        }}
      >
        {busy ? t('Saving…') : t('Save')}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Matchmaker({
  state, reload, busy, setBusy, showToast, haptic, open,
}: {
  state: PartnerState; reload: () => void; busy: boolean;
  setBusy: (b: boolean) => void; showToast: (s: string) => void; haptic: () => void;
  open: (s: any, d?: any) => void;
}) {
  const [want, setWant] = React.useState(state.want || 'any');
  const [gender, setGender] = React.useState(state.gender || '');

  // While queued, look again on a timer as well as on resume: the match is made
  // by whoever searches second, so the person already waiting finds out only by
  // asking.
  React.useEffect(() => {
    if (!state.queued) return;
    const t = setInterval(reload, 15000);
    return () => clearInterval(t);
  }, [state.queued, reload]);

  const find = async () => {
    haptic();
    setBusy(true);
    try {
      if (gender && gender !== state.gender) await api.setPartnerIdentity({ gender });
      const r = await api.findPartner(want);
      showToast(r.matched ? t('You have a partner!') : t('Looking for someone…'));
      reload();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t('Could not search'));
    }
    setBusy(false);
  };

  const cancel = async () => {
    setBusy(true);
    try {
      await api.cancelPartnerSearch();
      reload();
    } catch {
      showToast(t('Could not cancel'));
    }
    setBusy(false);
  };

  if (state.queued) {
    return (
      <div style={{ ...card, padding: '30px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{t('Looking for someone')}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
          {t('You’ll be matched as soon as somebody compatible is also looking. You can close the app — this keeps going without it.')}
        </div>
        <div tabIndex={0} onClick={busy ? undefined : cancel} className="press99" role="button" style={{ height: 48, borderRadius: 'calc(14px * var(--sq))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
          {t('Stop looking')}
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ ...card, padding: '22px 20px', marginBottom: 20 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {t('Someone who notices')}
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text2)', lineHeight: 1.65 }}>
          {t('Get matched with another Orbit member. You each choose — tracker by tracker — how much the other can see, from nothing at all up to full stats and notes. You can change any of it, or end the partnership, at any moment.')}
        </div>
      </div>

      <SectionLabel>{t('You are')}</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { k: 'female', l: t('Female') },
          { k: 'male', l: t('Male') },
          { k: 'other', l: t('Prefer not to say') },
        ].map((g) => (
          <div role="button" tabIndex={0} aria-pressed={gender === g.k} key={g.k} onClick={() => setGender(g.k)} className="press99" style={chip(gender === g.k, 'var(--indigo)')}>
            {g.l}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 22, lineHeight: 1.5 }}>
        {t('Used only to honour other people’s preference. It is never shown on your profile.')}
      </div>

      <SectionLabel>{t('Match me with')}</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        {[
          { k: 'any', l: t('Anyone') },
          { k: 'female', l: t('Women') },
          { k: 'male', l: t('Men') },
        ].map((w) => (
          <div role="button" tabIndex={0} aria-pressed={want === w.k} key={w.k} onClick={() => setWant(w.k)} className="press99" style={chip(want === w.k, 'var(--indigo)')}>
            {w.l}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.5 }}>
        {want === 'any'
          ? t('Fastest match: anyone who is also open to anyone.')
          : t('A narrower choice can take longer to match.')}
      </div>

      <div tabIndex={0}
        onClick={busy || !gender ? undefined : find}
        className={gender ? 'press99' : undefined}
        role="button"
        aria-disabled={!gender}
        style={{
          height: 54, borderRadius: 'calc(16px * var(--sq))', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 700, color: '#fff', cursor: gender ? 'pointer' : 'default', marginBottom: 14,
          background: gender ? 'var(--indigo)' : 'color-mix(in srgb,var(--indigo) 40%,var(--surface))',
        }}
      >
        {busy ? t('Searching…') : t('Find me a partner')}
      </div>

      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
        {t('Your partner sees your name and photo. They never see your email, your date of birth, your account balances or anything you have not switched on. You can report or remove them at any time.')}
      </div>

      {state.recent && (
        <div tabIndex={0}
          onClick={() => open('partnerReport' as any, { name: state.recent!.name, reload })}
          className="pressRow"
          role="button"
          style={{ ...card, padding: '14px 16px', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--danger)', textAlign: 'center', marginBottom: 24 }}
        >
          {t('Report {v}, your last partner', { v: state.recent.name.split(' ')[0] })}</div>
      )}
    </>
  );
}

export { REPORT_REASONS };
