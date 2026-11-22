// The live site is always served over https: a page opened as http:// is sent
// to https, and browsers are told to stay there. Render says which way a
// request came in with X-Forwarded-Proto.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

test('a page opened over http is sent to the same address over https', async () => {
  const r = await fetch(`${server.base}/fitness?x=1`, { headers: { 'x-forwarded-proto': 'http' }, redirect: 'manual' });
  assert.equal(r.status, 308);
  assert.equal(r.headers.get('location'), `https://${new URL(server.base).host}/fitness?x=1`);
});

test('over https, browsers are told to stay on https and upgrade anything insecure', async () => {
  const r = await fetch(`${server.base}/api/health`, { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('strict-transport-security') || '', /max-age=\d+/);
  assert.equal(r.headers.get('content-security-policy'), 'upgrade-insecure-requests');
});

test('without the header (local, tests, health checks) nothing changes', async () => {
  const r = await fetch(`${server.base}/api/health`, { redirect: 'manual' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('strict-transport-security'), null);
  assert.equal(r.headers.get('content-security-policy'), null);
});
