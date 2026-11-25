// 端末間同期（GitHub Gist）のマージ規則。
// ここが壊れると「別の端末の古い状態で在庫が上書きされる」「消したレシピが生き返る」「同じ食材が2つになる」
// という気づきにくい事故になるので、1件単位の勝ち負けを固定する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const NOW = '2026-11-25T20:00:00+09:00';
const T = new Date(NOW).getTime();
const SEED_T = Date.parse('2026-11-25T00:00:00+09:00');
const fresh = () => loadApp({ today: NOW, storage: {}, expectClean: true });
const doc = (a) => norm(a.$('syncDoc()'));
const food = (a, name) => norm(a.$(`S.foods.find(f => f.name === ${JSON.stringify(name)}) || null`));

test('初回起動の初期データは古い時刻のまま（新しい端末が他の端末の変更を上書きしない）', () => {
  const a = fresh();
  assert.equal(food(a, 'キムチ').updated, SEED_T);
  assert.equal(food(a, 'キムチ').id, 'seed-f-キムチ');
  assert.deepEqual(norm(a.$('S.deleted')), {});
});

test('変えた食材だけ時刻が付き、消したものには墓標が付く', () => {
  const a = fresh();
  a.$('setFoodStatus("seed-f-キムチ", "low")');
  assert.equal(food(a, 'キムチ').updated, T);
  assert.equal(food(a, '納豆').updated, SEED_T);
  a.$('S.foods = S.foods.filter(f => f.name !== "餅"); save()');
  assert.equal(a.$('S.deleted["foods:seed-f-餅"]'), T);
});

test('別の端末で「なし」にした食材は、まだ触っていない端末に届く', () => {
  const phone = fresh(); phone.$('setFoodStatus("seed-f-キムチ", "out")');
  const mac = fresh();
  mac.$(`mergeRemote(${JSON.stringify(doc(phone))})`);
  assert.equal(food(mac, 'キムチ').status, 'out');
  // 逆向き（新しい端末の初期データ）で戻らない
  phone.$(`mergeRemote(${JSON.stringify(doc(fresh()))})`);
  assert.equal(food(phone, 'キムチ').status, 'out');
});

test('同じ食材を両方で変えたら、あとに変えた方が残る', () => {
  const a = fresh(), b = fresh();
  a.$('S.foods.find(f => f.name === "卵").memo = "A"; save()');
  const d = doc(b); d.foods.find(f => f.name === '卵').memo = 'B'; d.foods.find(f => f.name === '卵').updated = T + 1000;
  a.$(`mergeRemote(${JSON.stringify(d)})`);
  assert.equal(food(a, '卵').memo, 'B');
  const d2 = doc(b); d2.foods.find(f => f.name === '卵').memo = 'old'; d2.foods.find(f => f.name === '卵').updated = T - 1000;
  a.$(`mergeRemote(${JSON.stringify(d2)})`);
  assert.equal(food(a, '卵').memo, 'B');
});

test('相手で追加したレシピ・食材は取り込まれ、相手で消したレシピはこちらでも消える', () => {
  const a = fresh(), b = fresh();
  b.$('addFood("しめじ", "冷蔵"); S.recipes.unshift({id:"r1",title:"新レシピ",ingredients:[],steps:[],tags:[],cooked:[]}); S.recipes = S.recipes.filter(r => r.id !== "seed-chk1"); save()');
  a.$(`mergeRemote(${JSON.stringify(doc(b))})`);
  assert.ok(food(a, 'しめじ'));
  assert.ok(a.$('S.recipes.some(r => r.id === "r1")'));
  assert.ok(!a.$('S.recipes.some(r => r.id === "seed-chk1")'));
});

test('消した後にこちらで直したものは残り、自分で消したものは相手の古い写しから生き返らない', () => {
  const a = fresh();
  a.$('S.recipes.find(r => r.id === "seed-chk2").notes = "直した"; save()');
  a.$(`mergeRemote(${JSON.stringify({ ...doc(fresh()), deleted: { 'recipes:seed-chk2': T - 5000 } })})`);
  assert.ok(a.$('S.recipes.some(r => r.id === "seed-chk2")'));
  a.$('S.recipes = S.recipes.filter(r => r.id !== "seed-chk3"); save()');
  a.$(`mergeRemote(${JSON.stringify(doc(fresh()))})`);
  assert.ok(!a.$('S.recipes.some(r => r.id === "seed-chk3")'));
});

test('両方の端末で同じ名前の食材を足しても1つにまとまる', () => {
  const a = fresh(), b = fresh();
  a.$('addFood("しめじ", "冷蔵")');
  b.$('addFood("しめじ", "冷蔵"); S.foods.find(f => f.name === "しめじ").memo = "B"; save()');
  const d = doc(b); d.foods.find(f => f.name === 'しめじ').updated = T + 10;
  a.$(`mergeRemote(${JSON.stringify(d)})`);
  const s = norm(a.$('S.foods.filter(f => f.name === "しめじ")'));
  assert.equal(s.length, 1); assert.equal(s[0].memo, 'B');
});

test('相手のデータが空・壊れている・別アプリなら何もしない', () => {
  const a = fresh();
  const n = a.$('S.foods.length');
  for (const r of [null, {}, { app: 'workout-ai-coach', foods: [], recipes: [], shop: [] }, { app: 'kitchen-recipes', foods: 1 }]) {
    assert.equal(a.$(`mergeRemote(${JSON.stringify(r)})`), false);
  }
  assert.equal(a.$('S.foods.length'), n);
});

test('同期前（v1）のデータは初期食材の id がそろい、同期で重複しない', () => {
  const v1 = { v: 1, foods: [{ id: 'fabc', name: 'キムチ', place: '冷蔵', status: 'out', exp: '', memo: '', updated: T }, { id: 'fxyz', name: 'しめじ', place: '冷蔵', status: 'have', exp: '', memo: '', updated: T }], recipes: [], shop: [] };
  const a = loadApp({ today: NOW, storage: { 'kitchen.v1': JSON.stringify(v1) }, expectClean: true });
  assert.equal(food(a, 'キムチ').id, 'seed-f-キムチ');
  assert.equal(food(a, 'しめじ').id, 'fxyz');
  a.$(`mergeRemote(${JSON.stringify(doc(fresh()))})`);
  assert.equal(norm(a.$('S.foods.filter(f => f.name === "キムチ")')).length, 1);
  assert.equal(food(a, 'キムチ').status, 'out');
});

test('syncNow: Gistを読んでマージし、変わった中身を書き戻す（API呼び出しはモック）', async () => {
  const a = fresh();
  const remote = doc(fresh()); remote.foods.find(f => f.name === '納豆').status = 'out'; remote.foods.find(f => f.name === '納豆').updated = T + 1;
  const calls = [];
  a.fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body });
    const ok = (j) => ({ ok: true, status: 200, json: async () => j });
    if (url.endsWith('/gists?per_page=100')) return ok([{ id: 'g1', files: { 'kitchen-recipes.json': {} } }]);
    if (url.endsWith('/gists/g1') && (opts.method || 'GET') === 'GET') return ok({ files: { 'kitchen-recipes.json': { content: JSON.stringify(remote) } } });
    if (url.endsWith('/gists/g1') && opts.method === 'PATCH') return ok({});
    throw new Error('想定外 ' + url);
  };
  a.$('SY = { token: "t" }');
  a.$('setFoodStatus("seed-f-卵", "low")');
  await a.$('syncNow()');
  assert.equal(a.$('SY.state'), 'ok', a.$('SY.err'));
  assert.equal(food(a, '納豆').status, 'out');
  const patch = calls.find(c => c.method === 'PATCH');
  const sent = JSON.parse(JSON.parse(patch.body).files['kitchen-recipes.json'].content);
  assert.equal(sent.foods.find(f => f.name === '卵').status, 'low');
  assert.equal(sent.foods.find(f => f.name === '納豆').status, 'out');
});

test('syncNow: 401 はエラー表示にして、データは消さない', async () => {
  const a = fresh();
  a.fetch = async () => ({ ok: false, status: 401 });
  a.$('SY = { token: "bad" }');
  await a.$('syncNow()');
  assert.equal(a.$('SY.state'), 'err');
  assert.match(a.$('SY.err'), /無効/);
  assert.ok(a.$('S.foods.length') > 30);
});

test('両方の端末から消えた項目の墓標も引き継ぎ、さらに古い端末から生き返らない（Codex指摘）', () => {
  const a = fresh();
  a.$('S.recipes = S.recipes.filter(r => r.id !== "seed-chk4"); save()');
  // 相手も既に消している（配列に無い）が、墓標は相手側には無い
  const b = doc(fresh()); b.recipes = b.recipes.filter(r => r.id !== 'seed-chk4');
  a.$(`mergeRemote(${JSON.stringify(b)})`);
  assert.equal(a.$('S.deleted["recipes:seed-chk4"]'), T);
  // まだ消していない古い端末の写し
  a.$(`mergeRemote(${JSON.stringify(doc(fresh()))})`);
  assert.ok(!a.$('S.recipes.some(r => r.id === "seed-chk4")'));
});

test('Mac のスクリプト（kitchen_add_recipe.py）で Gist に足したレシピが取り込まれ、タグ・PFCが付く', () => {
  const a = fresh();
  const remote = { app: 'kitchen-recipes', v: 2, foods: [], shop: [], deleted: {}, recipes: [{
    id: 'rnew1', title: '鮭のホイル焼き', tool: 'レンジグリル', servings: '2人分', yield: 2.0,
    ingredients: [{ name: '冷凍鮭', amount: '2切れ', optional: false }, { name: 'しめじ', amount: '100g', optional: false }, { name: '醤油', amount: '小さじ2', optional: false }],
    steps: ['包んで焼く'], notes: '', source: 'Claude', nutrition: '', tags: [], pfcAuto: true, updated: T + 5, fav: false, cooked: [], created: '2026-11-25' }] };
  assert.equal(a.$(`mergeRemote(${JSON.stringify(remote)})`), true);
  const r = norm(a.$('getRecipe("rnew1")'));
  assert.ok(r.tags.includes('鮭') && r.tags.includes('レンジグリル'));
  const p = norm(a.$('recipePfc(getRecipe("rnew1"))'));
  assert.equal(p.p, 24); // (鮭200g×22.3 + しめじ100g×2.7 + 醤油12g×7.7)/100 ÷ 2 = 24.1
  assert.ok(a.$('S.recipes.length') > 34, '初期レシピは消えない');
});
