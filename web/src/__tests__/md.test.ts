import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, parseBlocks, plain } from '../lib/md';

const html = (s: string) => renderToStaticMarkup(React.createElement(Markdown, { text: s }));

describe('the brief reader', () => {
  it('reads headings, lists, quotes and paragraphs', () => {
    const b = parseBlocks('## Markets\nS&P up.\nNasdaq flat.\n\n- one\n  - two\n1. first\n> said\n---');
    expect(b.map((x) => x.k)).toEqual(['h', 'p', 'li', 'li', 'li', 'q', 'hr']);
    expect(b[2]).toMatchObject({ ordered: false, depth: 0, text: 'one' });
    expect(b[3]).toMatchObject({ depth: 1, text: 'two' });
    expect(b[4]).toMatchObject({ ordered: true, n: 1, text: 'first' });
  });

  it('formats inline text, with bold inside a link', () => {
    const out = html('**Big** and *small* and `code` and [**the** story](https://example.com/a) and https://news.site/x.');
    expect(out).toContain('<b style="font-weight:700">Big</b>');
    expect(out).toContain('<i>small</i>');
    expect(out).toContain('code</code>');
    expect(out).toMatch(/<a href="https:\/\/example.com\/a"[^>]*><b[^>]*>the<\/b> story<\/a>/);
    // The full stop after a bare address isn't part of it.
    expect(out).toContain('href="https://news.site/x"');
    expect(out).toContain('news.site/x</a>.');
  });

  it('leaves snake_case, sums and stray stars alone', () => {
    const out = html('file_name_here and 2*3*4 and a * b');
    expect(out).not.toContain('<i>');
    expect(out).toContain('file_name_here');
  });

  it('never makes HTML or script links from the text', () => {
    const out = html('<img src=x onerror=alert(1)> [x](javascript:alert(1))');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).not.toContain('href="javascript');
  });

  it('gives a plain one-line preview', () => {
    expect(plain('## Hook\n- **Bold** idea with [a link](https://x.y)\n- _second_')).toBe('Hook · Bold idea with a link · second');
  });
});
