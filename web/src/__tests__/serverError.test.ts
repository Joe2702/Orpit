import { afterEach, describe, expect, it } from 'vitest';
import { __setLangForTest } from '../i18n';
import { AR, AR_DATA } from '../i18n/ar';
import { serverError } from '../lib/serverError';

afterEach(() => __setLangForTest('en'));

describe('server messages in the reader’s language', () => {
  it('leaves English as it is', () => {
    expect(serverError('Incorrect email or password')).toBe('Incorrect email or password');
    expect(serverError('Too many attempts. Try again in 30s.')).toBe('Too many attempts. Try again in 30s.');
  });

  it('translates fixed messages and ones with numbers in them', () => {
    __setLangForTest('ar', AR, AR_DATA);
    expect(serverError('Incorrect email or password')).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    expect(serverError('Too many attempts. Try again in 30s.')).toBe('محاولات كثيرة. حاول مرة أخرى بعد 30 ث.');
    expect(serverError('Password must be at least 8 characters')).toBe('يجب ألا تقل كلمة المرور عن 8 أحرف');
    expect(serverError('New password must be at least 8 characters')).toBe('يجب ألا تقل كلمة المرور الجديدة عن 8 أحرف');
    expect(serverError('Invalid token')).toBe('سجّل الدخول من جديد');
  });

  it('shows an unknown message rather than nothing', () => {
    __setLangForTest('ar', AR, AR_DATA);
    expect(serverError('Something brand new')).toBe('Something brand new');
  });
});
