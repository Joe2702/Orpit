// The home currency can be any ISO 4217 code, not only the first five.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

test('any three-letter code is saved as the currency, and anything else is ignored', async () => {
  const c = await new Client(server.base).signup();
  await c.call('/api/me', 'PATCH', { currency: 'AED' });
  assert.equal(c.state.profile.currency, 'AED');
  await c.call('/api/me', 'PATCH', { currency: 'JPY' });
  assert.equal(c.state.profile.currency, 'JPY');
  for (const bad of ['aed', 'DOLLARS', '$', 42, '']) {
    await c.call('/api/me', 'PATCH', { currency: bad });
    assert.equal(c.state.profile.currency, 'JPY');
  }
});
