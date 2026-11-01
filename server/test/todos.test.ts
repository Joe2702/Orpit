// To-do lists: lists, tasks in them, ticking off, moving, clearing, and the
// offline replay of a task added with no signal.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, Client, type Server } from './harness';

let server: Server;
before(async () => {
  server = await startServer();
});
after(() => server?.stop());

type S = { todoLists: { id: string; name: string; color: string }[]; todos: { id: string; listId: string; title: string; note: string | null; due: string | null; doneTs: number | null; sort: number }[] };
const st = (c: Client) => c.state as unknown as S;
const listId = (c: Client, name: string) => st(c).todoLists.find((l) => l.name === name)!.id;
const task = (c: Client, title: string) => st(c).todos.find((x) => x.title === title)!;

test('lists hold tasks; a task can be dated, ticked off and back, edited and moved', async () => {
  const c = await new Client(server.base).signup();
  await c.call('/api/todo-lists', 'POST', { name: 'Uni', color: 'blue' });
  await c.call('/api/todo-lists', 'POST', { name: 'Training', color: 'coral' });
  assert.deepEqual(st(c).todoLists.map((l) => l.name), ['Uni', 'Training']);

  const uni = listId(c, 'Uni');
  await c.call('/api/todos', 'POST', { listId: uni, title: 'Lab report', due: '2026-11-02' });
  await c.call('/api/todos', 'POST', { listId: uni, title: 'Read chapter 4', note: 'pages 80–112' });
  assert.deepEqual(st(c).todos.map((x) => x.title), ['Lab report', 'Read chapter 4']);
  assert.equal(task(c, 'Lab report').due, '2026-11-02');
  assert.equal(task(c, 'Read chapter 4').note, 'pages 80–112');

  await c.call(`/api/todos/${task(c, 'Lab report').id}/done`, 'POST', { done: true });
  const doneTs = task(c, 'Lab report').doneTs;
  assert.ok(doneTs && Math.abs(doneTs - Date.now()) < 60_000);
  // Saying "done" again keeps the original time; a replay can't move it.
  await c.call(`/api/todos/${task(c, 'Lab report').id}/done`, 'POST', { done: true });
  assert.equal(task(c, 'Lab report').doneTs, doneTs);
  await c.call(`/api/todos/${task(c, 'Lab report').id}/done`, 'POST', { done: false });
  assert.equal(task(c, 'Lab report').doneTs, null);

  // Only the fields sent change.
  await c.call(`/api/todos/${task(c, 'Read chapter 4').id}`, 'PATCH', { due: '2026-11-05' });
  assert.equal(task(c, 'Read chapter 4').note, 'pages 80–112');
  assert.equal(task(c, 'Read chapter 4').due, '2026-11-05');
  await c.call(`/api/todos/${task(c, 'Read chapter 4').id}`, 'PATCH', { title: 'Read chapter 5', note: '', due: null });
  assert.equal(task(c, 'Read chapter 5').note, null);
  assert.equal(task(c, 'Read chapter 5').due, null);

  // Moving to another list puts it at the end there.
  const training = listId(c, 'Training');
  await c.call('/api/todos', 'POST', { listId: training, title: 'Book physio' });
  await c.call(`/api/todos/${task(c, 'Read chapter 5').id}`, 'PATCH', { listId: training });
  const inTraining = st(c).todos.filter((x) => x.listId === training).sort((a, b) => a.sort - b.sort);
  assert.deepEqual(inTraining.map((x) => x.title), ['Book physio', 'Read chapter 5']);

  await assert.rejects(c.call('/api/todos', 'POST', { listId: uni, title: '   ' }), /400/);
  await assert.rejects(c.call('/api/todos', 'POST', { listId: uni, title: 'x', due: 'tomorrow' }), /400/);
  await assert.rejects(c.call('/api/todo-lists', 'POST', { name: '' }), /400/);
});

test('a task added offline and replayed is added once', async () => {
  const c = await new Client(server.base).signup();
  await c.call('/api/todo-lists', 'POST', { name: 'SAC' });
  const body = JSON.stringify({ listId: listId(c, 'SAC'), title: 'Approve hoodie samples' });
  const send = () =>
    fetch(server.base + '/api/todos', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${c.token}`, 'x-orbit-op-id': 'op-todo-1' },
      body,
    }).then((r) => r.json());
  await send();
  const again = (await send()) as S;
  assert.equal(again.todos.filter((x) => x.title === 'Approve hoodie samples').length, 1);
});

test('nobody can see or touch another person’s lists or tasks', async () => {
  const a = await new Client(server.base).signup();
  const b = await new Client(server.base).signup();
  await a.call('/api/todo-lists', 'POST', { name: 'Private' });
  await a.call('/api/todos', 'POST', { listId: listId(a, 'Private'), title: 'Secret' });
  const secret = task(a, 'Secret');

  await b.call('/api/state');
  assert.equal(st(b).todoLists.length, 0);
  assert.equal(st(b).todos.length, 0);
  await assert.rejects(b.call('/api/todos', 'POST', { listId: listId(a, 'Private'), title: 'Sneaky' }), /404/);
  await assert.rejects(b.call(`/api/todos/${secret.id}`, 'PATCH', { title: 'Changed' }), /404/);
  await assert.rejects(b.call(`/api/todos/${secret.id}/done`, 'POST', { done: true }), /404/);
  await b.call(`/api/todos/${secret.id}`, 'DELETE');
  await b.call(`/api/todo-lists/${listId(a, 'Private')}`, 'DELETE');

  await a.call('/api/state');
  assert.equal(task(a, 'Secret').title, 'Secret');
  assert.equal(task(a, 'Secret').doneTs, null);
});

test('reorder, clear finished, delete a list with its tasks, export and reset', async () => {
  const c = await new Client(server.base).signup();
  await c.call('/api/todo-lists', 'POST', { name: 'A' });
  await c.call('/api/todo-lists', 'POST', { name: 'B' });
  const a = listId(c, 'A');
  for (const t of ['one', 'two', 'three']) await c.call('/api/todos', 'POST', { listId: a, title: t });
  const [one, two, three] = ['one', 'two', 'three'].map((t) => task(c, t).id);

  await c.call('/api/todos/order', 'PATCH', { ids: [three, one, two] });
  const order = st(c).todos.filter((x) => x.listId === a).sort((x, y) => x.sort - y.sort).map((x) => x.title);
  assert.deepEqual(order, ['three', 'one', 'two']);

  await c.call('/api/todo-lists/order', 'PATCH', { ids: [listId(c, 'B'), a] });
  assert.deepEqual(st(c).todoLists.map((l) => l.name), ['B', 'A']);

  await c.call(`/api/todos/${one}/done`, 'POST', { done: true });
  await c.call(`/api/todo-lists/${a}/done`, 'DELETE');
  assert.deepEqual(st(c).todos.map((x) => x.title).sort(), ['three', 'two']);

  const exp = await c.call<{ todoLists: unknown[]; todos: { title: string }[] }>('/api/export');
  assert.equal(exp.todoLists.length, 2);
  assert.deepEqual(exp.todos.map((x) => x.title).sort(), ['three', 'two']);

  await c.call(`/api/todo-lists/${a}`, 'DELETE');
  assert.deepEqual(st(c).todoLists.map((l) => l.name), ['B']);
  assert.equal(st(c).todos.length, 0);

  await c.call('/api/todos', 'POST', { listId: listId(c, 'B'), title: 'kept until reset' });
  await c.call('/api/reset', 'POST');
  assert.equal(st(c).todoLists.length, 0);
  assert.equal(st(c).todos.length, 0);
});
