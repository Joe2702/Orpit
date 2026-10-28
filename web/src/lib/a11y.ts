// Many tappable things in Orbit are styled <div>s marked role="button" or
// role="switch". A real <button> answers Enter and Space by itself; these need
// telling, so a keyboard, switch-access or TalkBack-with-keyboard user can
// press them too.
export function installKeyActivation(): void {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target as HTMLElement | null;
    if (!el || el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
    const role = el.getAttribute('role');
    if (role !== 'button' && role !== 'switch') return;
    if (el.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault(); // Space would otherwise scroll the page
    el.click();
  });
}
