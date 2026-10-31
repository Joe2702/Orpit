// Persisted per-screen block order lives as JSON in the user's profile.layout.

export function parseLayout(raw: string | null | undefined): Record<string, string[]> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

// Keep only known-visible blocks, then add any visible ones the saved order
// doesn't mention yet (a newly added section) so nothing ever disappears. A new
// one goes where it sits by default, after the block before it, rather than at
// the very bottom where nobody scrolls to find it.
export function reconcile(saved: string[] | undefined, visible: string[]): string[] {
  const out = Array.isArray(saved) ? saved.filter((id) => visible.includes(id)) : [];
  visible.forEach((id, i) => {
    if (out.includes(id)) return;
    const prev = visible.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, id);
  });
  return out;
}
