import ts from 'typescript';

// Reads every t('…'), tn(n, '…', '…') and tk('…') in the source, so a test can
// check each has an Arabic version with the same {placeholders}.

export interface Key {
  text: string;
  /** Counted: needs Arabic plural forms. */
  plural: boolean;
  /** The English singular, for reference. */
  one?: string;
  file: string;
}

const lit = (n: ts.Node | undefined): string | null =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

export function extractKeys(files: { name: string; src: string }[]): Key[] {
  const out: Key[] = [];
  for (const f of files) {
    const sf = ts.createSourceFile(f.name, f.src, ts.ScriptTarget.Latest, true, f.name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
        const fn = n.expression.text;
        if (fn === 't' || fn === 'tk') {
          const s = lit(n.arguments[0]);
          if (s != null) out.push({ text: s, plural: false, file: f.name });
        } else if (fn === 'tn') {
          const one = lit(n.arguments[1]);
          const other = lit(n.arguments[2]);
          if (other != null) out.push({ text: other, plural: true, one: one ?? undefined, file: f.name });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

export const placeholders = (s: string): string[] => [...new Set((s.match(/\{\w+\}/g) || []).sort())];
