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

// Keep only known-visible blocks, then append any visible ones the saved order
// doesn't mention yet (e.g. a newly added widget) so nothing ever disappears.
export function reconcile(saved: string[] | undefined, visible: string[]): string[] {
  const out = Array.isArray(saved) ? saved.filter((id) => visible.includes(id)) : [];
  visible.forEach((id) => {
    if (!out.includes(id)) out.push(id);
  });
  return out;
}
