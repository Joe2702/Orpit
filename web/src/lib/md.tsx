// A small Markdown reader for text an assistant wrote: paragraphs, headings,
// bullet and numbered lists, quotes, rules, bold, italics, code and links.
//
// It builds React elements and never HTML strings, so nothing in the text can
// run or restyle the app. Links are only http(s), and open in the browser.

import React from 'react';

type Block =
  | { k: 'h'; level: number; text: string }
  | { k: 'p'; lines: string[] }
  | { k: 'li'; ordered: boolean; n: number; depth: number; text: string }
  | { k: 'q'; lines: string[] }
  | { k: 'hr' };

export function parseBlocks(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (para.length) out.push({ k: 'p', lines: para });
    if (quote.length) out.push({ k: 'q', lines: quote });
    para = [];
    quote = [];
  };
  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    let m: RegExpMatchArray | null;
    if (!line.trim()) {
      flush();
    } else if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/))) {
      flush();
      out.push({ k: 'h', level: m[1].length, text: m[2] });
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}$/.test(line)) {
      flush();
      out.push({ k: 'hr' });
    } else if ((m = line.match(/^(\s*)[-*+•]\s+(.*)$/))) {
      flush();
      out.push({ k: 'li', ordered: false, n: 0, depth: Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), text: m[2] });
    } else if ((m = line.match(/^(\s*)(\d{1,3})[.)]\s+(.*)$/))) {
      flush();
      out.push({ k: 'li', ordered: true, n: Number(m[2]), depth: Math.min(2, Math.floor(m[1].replace(/\t/g, '  ').length / 2)), text: m[3] });
    } else if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) {
      if (para.length) {
        out.push({ k: 'p', lines: para });
        para = [];
      }
      quote.push(m[1]);
    } else {
      if (quote.length) {
        out.push({ k: 'q', lines: quote });
        quote = [];
      }
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

// Links, bold, italics, code and bare web addresses, in the order they're tried.
const INLINE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*(\S(?:[^*\n]*?\S)?)\*\*|__(\S(?:[^_\n]*?\S)?)__|`([^`\n]+)`|\*(\S(?:[^*\n]*?\S)?)\*|_(\S(?:[^_\n]*?\S)?)_|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

const isWord = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);

export const openLink = (url: string) => {
  if (!/^https?:\/\//i.test(url)) return;
  window.open(url, '_system');
};

export function inline(text: string, key = 'i'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  // Its own copy: link text and bold are read by calling this again, and a
  // shared global pattern would lose its place.
  const re = new RegExp(INLINE.source, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const at = m.index;
    // snake_case and 2*3*4 aren't emphasis: underscores and single stars only
    // count when they don't sit inside a word.
    if ((m[6] !== undefined || m[7] !== undefined) && (isWord(text[at - 1]) || isWord(text[at + m[0].length]))) {
      re.lastIndex = at + 1;
      continue;
    }
    if (at > last) out.push(text.slice(last, at));
    const k = `${key}.${n++}`;
    if (m[1] !== undefined) out.push(<Link key={k} url={m[2]}>{inline(m[1], k)}</Link>);
    else if (m[3] !== undefined || m[4] !== undefined) out.push(<b key={k} style={{ fontWeight: 700 }}>{inline(m[3] ?? m[4], k)}</b>);
    else if (m[5] !== undefined)
      out.push(
        <code key={k} style={{ fontFamily: 'var(--font-mono, ui-monospace, monospace)', fontSize: '.9em', background: 'var(--bg)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '0 4px' }}>
          {m[5]}
        </code>
      );
    else if (m[6] !== undefined || m[7] !== undefined) out.push(<i key={k}>{inline(m[6] ?? m[7], k)}</i>);
    else if (m[8] !== undefined) out.push(<Link key={k} url={m[8]}>{m[8].replace(/^https?:\/\/(www\.)?/i, '')}</Link>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Link({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openLink(url);
      }}
      rel="noreferrer"
      style={{ color: 'var(--indigo)', fontWeight: 600, textDecoration: 'none', overflowWrap: 'anywhere' }}
    >
      {children}
    </a>
  );
}

/** The text with the Markdown taken out, for a one-line preview. */
export function plain(src: string): string {
  return parseBlocks(src)
    .filter((b) => b.k !== 'hr')
    .map((b) => (b.k === 'p' || b.k === 'q' ? b.lines.join(' ') : b.text))
    // Bullets and paragraphs stay apart: "Stocks flat · Gold higher".
    .join(' · ')
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__|`)/g, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=\s|$|[.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function Markdown({ text, size = 15 }: { text: string; size?: number }) {
  const blocks = parseBlocks(text);
  const base: React.CSSProperties = { fontSize: size, lineHeight: 1.55, color: 'var(--text)', overflowWrap: 'break-word' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        if (b.k === 'h')
          return (
            <div key={k} role="heading" aria-level={Math.min(6, b.level + 2)} style={{ ...base, fontSize: b.level <= 2 ? size + 1.5 : size, fontWeight: 700, marginTop: i ? 6 : 0 }}>
              {inline(b.text, k)}
            </div>
          );
        if (b.k === 'hr') return <div key={k} style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />;
        if (b.k === 'q')
          return (
            <div key={k} style={{ ...base, color: 'var(--text2)', borderInlineStart: '3px solid var(--hairline)', paddingInlineStart: 12 }}>
              {b.lines.map((l, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <br />}
                  {inline(l, `${k}.${j}`)}
                </React.Fragment>
              ))}
            </div>
          );
        if (b.k === 'li')
          return (
            <div key={k} style={{ ...base, display: 'flex', gap: 9, paddingInlineStart: b.depth * 18, marginTop: -3 }}>
              <span aria-hidden style={{ flex: 'none', minWidth: b.ordered ? 18 : 8, color: 'var(--text2)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {b.ordered ? `${b.n}.` : <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: 9, background: 'var(--text3)', transform: 'translateY(-2px)' }} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>{inline(b.text, k)}</span>
            </div>
          );
        return (
          <div key={k} style={base}>
            {b.lines.map((l, j) => (
              <React.Fragment key={j}>
                {j > 0 && <br />}
                {inline(l, `${k}.${j}`)}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}
