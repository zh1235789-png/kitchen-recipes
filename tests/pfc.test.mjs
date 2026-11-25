import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const NOW = '2026-11-25T20:00:00+09:00';
const app = (storage = {}) => loadApp({ today: NOW, storage, expectClean: true });

test('初期レシピは全部、材料から計算したPFC・食物繊維・塩分が出る', () => {
  const a = app();
  const bad = norm(a.$('S.recipes.filter(r => { const p = recipePfc(r); return !r.pfcAuto || !p || !(p.kcal > 0) || p.p == null || p.fib == null || p.salt == null; }).map(r => r.title)'));
  assert.deepEqual(bad, []);
  // 計算できない材料は好みのトッピング以外に無い
  const skipped = norm(a.$('S.recipes.flatMap(r => computeRecipe(r).skipped)'));
  assert.deepEqual(skipped, ['韓国のり（適量）']);
});
test('文章からPFCを拾う（全角数字・「約」・g付きも）', () => {
  const a = app();
  const p = t => norm(a.$(`parsePfc(${JSON.stringify(t)})`));
  assert.deepEqual(p('おかずだけ 約220kcal／P 28g／F 5g／食物繊維 6.6g'), { kcal: 220, p: 28, f: 5, c: null, fib: 6.6, salt: null });
  assert.deepEqual(p('P約45 F約23 C約63／約647kcal'), { kcal: 647, p: 45, f: 23, c: 63, fib: null, salt: null });
  assert.equal(p('約２５０kcal／P３５').p, 35);
  assert.equal(a.$('parsePfc("PFC比 30:30:40")'), null);
  assert.equal(a.$('parsePfc("")'), null);
});
test('食物繊維・塩分を文章から拾う（「食塩相当量」も）', () => {
  const a = app();
  const p = t => norm(a.$(`parsePfc(${JSON.stringify(t)})`));
  const r = p('おかずだけ：約210kcal／P 28g／F 6g／食物繊維 7.4g／塩分 約1.7g');
  assert.equal(r.fib, 7.4); assert.equal(r.salt, 1.7);
  assert.equal(p('食物繊維：１２．５g　食塩相当量 0.6g').salt, 0.6);
});
test('P多い順・食物繊維多い順・塩分少ない順で並ぶ', () => {
  const a = app();
  for (const [f, key, desc] of [['protein', 'p', true], ['fiber', 'fib', true], ['lowsalt', 'salt', false]]) {
    a.$(`UI.recFilter = "${f}"`);
    const v = norm(a.$(`filterRecipes().map(x => x.pf.${key})`));
    assert.ok(v.length > 30);
    assert.deepEqual(v, [...v].sort((x, y) => desc ? y - x : x - y));
  }
});
test('手入力のレシピは手入力の値のまま', () => {
  const a = app();
  a.$('S.recipes.unshift({ id: "r1", title: "外食", ingredients: [{ name: "鶏むね肉", amount: "100g" }], steps: [], tags: [], cooked: [], pfcAuto: false, pfc: { kcal: 999, p: 1, f: 1, c: 1, per: "1食" } })');
  assert.equal(a.$('recipePfc(S.recipes[0]).kcal'), 999);
});
test('前の版（v4）の初期レシピは自動計算に切り替わり、「適量」だった量が新しい量になる', () => {
  const v4 = { v: 4, foods: [], shop: [], deleted: {}, recipes: [
    { id: 'seed-soboro', title: '鶏胸そぼろ丼', servings: '1食分', updated: 5, ingredients: [
      { name: '冷凍鶏胸肉', amount: '150g' }, { name: '醤油', amount: '適量' }, { name: 'みりん', amount: '適量' }, { name: 'おろししょうが', amount: '少々' },
      { name: '卵', amount: '1個' }, { name: '米', amount: '麦ご飯200g' }, { name: '韓国のり', amount: '適量', optional: true }, { name: 'キムチ', amount: '適量', optional: true, use: true }],
      steps: [], tags: [], cooked: ['2026-11-25'], pfc: { kcal: 550, p: 44, f: 8, c: 72, per: '1食' } },
    { id: 'seed-chk3', title: '塩麹蒸し', servings: '2食分', updated: 5, ingredients: [{ name: '鶏むね肉', amount: '300g' }], steps: [], tags: [], cooked: [], pfc: { kcal: 1, p: 1, f: 1, c: 1 } },
  ] };
  const a = app({ 'kitchen.v1': JSON.stringify(v4) });
  assert.equal(a.$('S.v'), 5);
  const s = norm(a.$('S.recipes[0]'));
  assert.equal(s.pfcAuto, true);
  assert.equal(s.ingredients[1].amount, '大さじ1/2');
  assert.equal(s.ingredients[5].name, '麦ご飯');
  assert.equal(s.ingredients[7].use, true, '「計算に入れる」の選択は残す');
  assert.deepEqual(s.cooked, ['2026-11-25']);
  assert.equal(s.updated, 5, '移行だけでは同期の時刻を進めない');
  // 材料を自分で変えていたレシピは材料をそのまま使って計算する
  const c = norm(a.$('S.recipes[1]'));
  assert.equal(c.ingredients.length, 1);
  assert.equal(a.$('recipePfc(S.recipes[1]).p'), 35); // 300g×23.3/100÷2
});
test('もっと前の版（v3）で栄養メモに書いた値は、手入力のレシピでそのまま使う', () => {
  const v3 = { v: 3, foods: [], shop: [], deleted: {}, recipes: [
    { id: 'r9', title: '自作', nutrition: '約300kcal／P20 F10 C30／塩分9.9g', ingredients: [], steps: [], tags: [], cooked: [], updated: 1, pfc: { kcal: 300, p: 20, f: 10, c: 30, per: '1食' } },
  ] };
  const a = app({ 'kitchen.v1': JSON.stringify(v3) });
  assert.equal(a.$('recipePfc(S.recipes[0]).salt'), 9.9);
  assert.equal(a.$('S.recipes[0].pfcAuto'), undefined);
});
