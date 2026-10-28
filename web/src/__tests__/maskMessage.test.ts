import { describe, it, expect } from 'vitest';
import { maskMessage } from '../lib/smsParse';

describe('masking a bank message before it is shared', () => {
  it('turns every digit into 9, keeping the shape', () => {
    expect(maskMessage('Your card **1234 was charged EGP 1,450.75 on 21/10 at 14:02')).toBe(
      'Your card **9999 was charged EGP 9,999.99 on 99/99 at 99:99'
    );
  });

  it('hides names after to, from and Dear, but not accounts', () => {
    const m = maskMessage('Dear Youssif Mohammed, you sent EGP 500 to Ahmed Ali via InstaPay from your account 1234');
    expect(m).toContain('Dear [name]');
    expect(m).toContain('to [name] via');
    expect(m).toContain('from your account 9999');
    expect(m).not.toMatch(/Youssif|Ahmed/);
  });

  it('hides Arabic names and digits', () => {
    const m = maskMessage('تم تحويل ٥٠٠ جنيه إلى محمد علي من حسابك');
    expect(m).toContain('999');
    expect(m).toContain('إلى [name]');
    expect(m).toContain('من حسابك');
    expect(m).not.toContain('محمد');
  });

  it('removes links and emails', () => {
    expect(maskMessage('Details at https://bank.example/x?id=7 or help@bank.com')).toBe('Details at [link] or [email]');
  });
});
