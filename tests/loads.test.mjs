// index.html が起動時に例外を出さないことの回帰テスト
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLoads } from './harness.mjs';

const T = '2026-11-25T09:00:00+09:00';
test('初回起動で例外なく初期化でき、初期データが入る', () => {
  const app = assertLoads({ today: T, storage: {} });
  assert.ok(app.$('S.foods.length') > 30);
  assert.ok(app.$('S.recipes.length') >= 30);
  assert.ok(app.__store['kitchen.v1'], '初回に保存される');
});
test('保存データが壊れていても初期化でき、元データは退避される', () => {
  const app = assertLoads({ today: T, storage: { 'kitchen.v1': 'not json{' } });
  assert.equal(app.$('S.brokenNotice'), true);
  assert.ok(Object.keys(app.__store).some(k => k.startsWith('kitchen.v1.broken-')));
});
test('形の違うJSONでも初期化できる', () => {
  assertLoads({ today: T, storage: { 'kitchen.v1': '{"foods":1}' } });
});
test('localStorage が例外を投げても起動する', () => {
  const junk = new Proxy({}, { get: () => { throw new Error('denied'); }, has: () => { throw new Error('denied'); } });
  assertLoads({ today: T, storage: junk });
});
