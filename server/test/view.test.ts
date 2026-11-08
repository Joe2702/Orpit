import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickView } from '../src/view';

const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

test('computers get the desktop site and phones the phone app', () => {
  assert.equal(pickView({ ua: MAC }), 'desktop');
  assert.equal(pickView({ ua: WIN, chMobile: '?0' }), 'desktop');
  assert.equal(pickView({ ua: ANDROID, chMobile: '?1' }), 'phone');
  assert.equal(pickView({ ua: IPHONE }), 'phone');
  assert.equal(pickView({}), 'desktop');
});

test('a chosen layout wins over the guess, either way', () => {
  assert.equal(pickView({ ua: WIN, cookie: 'a=1; orbit_view=phone' }), 'phone');
  assert.equal(pickView({ ua: IPHONE, cookie: 'orbit_view=desktop; b=2' }), 'desktop');
  assert.equal(pickView({ ua: WIN, cookie: 'not_orbit_view=phone' }), 'desktop');
});
