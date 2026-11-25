import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const NOW = '2026-11-25T20:00:00+09:00';
const app = (storage = {}) => loadApp({ today: NOW, storage, expectClean: true });

test('初期レシピは全部PFCが入っている', () => {
  const a = app();
  const none = norm(a.$('S.recipes.filter(r => !r.pfc || r.pfc.kcal == null || r.pfc.p == null || r.pfc.f == null || r.pfc.c == null).map(r => r.title)'));
  assert.deepEqual(none, []);
  assert.deepEqual(norm(a.$('S.recipes.find(r => r.id === "seed-c4m1").pfc')), { kcal: 716, p: 54, f: 21, c: 71, per: '1食' });
});
test('文章からPFCを拾う（全角数字・「約」・g付きも）', () => {
  const a = app();
  const p = t => norm(a.$(`parsePfc(${JSON.stringify(t)})`));
  assert.deepEqual(p('おかずだけ 約220kcal／P 28g／F 5g／食物繊維 6.6g'), { kcal: 220, p: 28, f: 5, c: null });
  assert.deepEqual(p('P約45 F約23 C約63／約647kcal'), { kcal: 647, p: 45, f: 23, c: 63 });
  assert.deepEqual(p('約２５０kcal／P３５'), { kcal: 250, p: 35, f: null, c: null });
  assert.equal(a.$('parsePfc("PFC比 30:30:40")'), null);
  assert.equal(a.$('parsePfc("")'), null);
});
test('貼り付けたレシピの目安からPFCが入る', () => {
  const a = app();
  const r = norm(a.$('parseRecipeText("## 鶏むね蒸し\\n**材料**\\n- 鶏むね肉 150g\\n**作り方**\\n1. 蒸す\\n**目安**：約250kcal／P 35g／F 3g／C 2g")'));
  assert.deepEqual(r.pfc, { kcal: 250, p: 35, f: 3, c: 2 });
});
test('前の版（v2）で保存した初期レシピにPFCが補われ、自分で入れた値は残る', () => {
  const v2 = { v: 2, foods: [], shop: [], deleted: {}, recipes: [
    { id: 'seed-chk1', title: '基本のサラダチキン', ingredients: [], steps: [], tags: [], cooked: [], updated: 1 },
    { id: 'seed-ebi1', title: 'えびの酒蒸し', ingredients: [], steps: [], tags: [], cooked: [], updated: 1, pfc: { kcal: 999, p: 1, f: 1, c: 1, per: '自分' } },
    { id: 'r1', title: '自作', nutrition: '約300kcal／P20 F10 C30', ingredients: [], steps: [], tags: [], cooked: [], updated: 1 },
  ] };
  const a = app({ 'kitchen.v1': JSON.stringify(v2) });
  assert.equal(a.$('S.v'), 3);
  assert.equal(a.$('S.recipes[0].pfc.p'), 58);
  assert.equal(a.$('S.recipes[1].pfc.kcal'), 999);
  assert.equal(a.$('S.recipes[2].pfc.c'), 30);
  // 移行だけでは同期の時刻を進めない（ほかの端末の変更を上書きしない）
  assert.equal(a.$('S.recipes[0].updated'), 1);
});
test('P多い順で並ぶ', () => {
  const a = app();
  a.$('UI.recFilter = "protein"');
  const ps = norm(a.$('filterRecipes().map(x => x.r.pfc.p)'));
  assert.deepEqual(ps, [...ps].sort((x, y) => y - x));
  assert.equal(ps[0], 59);
});
