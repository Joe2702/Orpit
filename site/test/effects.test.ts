import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// An effect written as `useEffect(() => something(), deps)` returns whatever
// something() returns, and React calls that as the effect's cleanup. When it
// isn't a function the page crashes: newer Chrome returns a Promise from
// scrollIntoView, and the command menu took the whole site down on hover.
// Effects get a block body; returning a cleanup is then always on purpose.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BAD = /use(?:Layout)?Effect\(\s*\(\)\s*=>(?!\s*(?:\{|\(\)\s*=>))/;

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : files(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('effects', () => {
  it('never return a value by accident, on the website or the phone app', () => {
    const bad = ['site/src', 'web/src'].flatMap((d) =>
      files(path.join(ROOT, d)).flatMap((f) =>
        fs
          .readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => (BAD.test(line) ? `${path.relative(ROOT, f)}:${i + 1}` : null))
          .filter((x): x is string => !!x)
      )
    );
    expect(bad).toEqual([]);
  });
});
