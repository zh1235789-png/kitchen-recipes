// 材料の量 → g → PFC の計算
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const app = () => loadApp({ today: '2026-11-25T20:00:00+09:00', storage: {}, expectClean: true });
const grams = (a, name, amount) => a.$(`amountToGrams(${JSON.stringify(amount)}, nutrFood(${JSON.stringify(name)}))`);

test('量の書き方をgに直す', () => {
  const a = app();
  assert.equal(grams(a, '冷凍鶏胸肉', '300g（一口大）'), 300);
  assert.equal(grams(a, '鶏むね肉', '1枚（約250g）'), 250);
  assert.equal(grams(a, '鶏むね肉', '1枚'), 250);
  assert.equal(grams(a, '冷凍砂肝', '300〜400g'), 350);
  assert.equal(grams(a, '醤油', '大さじ2'), 36);
  assert.equal(grams(a, '塩', '小さじ1/2'), 3);
  assert.equal(Math.round(grams(a, '味噌', '大さじ1強') * 10) / 10, 19.8);
  assert.equal(grams(a, 'にんじん', '1/2本'), 75);
  assert.equal(grams(a, '料理酒', '50ml'), 50);
  assert.equal(grams(a, '卵', '2個（ゆで卵）'), 100);
  assert.equal(grams(a, '塩', 'ひとつまみ'), 1);
  assert.equal(grams(a, 'おろしにんにく', '2cm'), 1);
  assert.equal(grams(a, 'すりごま', '大さじ1'), 9);
  assert.equal(grams(a, 'ほうれん草', '１束（２００ｇ）'), 200);
  assert.equal(grams(a, '韓国のり', '適量'), null);
  assert.equal(grams(a, 'しめじ', '1房'), null, '重さの分からない単位は計算しない');
});
test('材料名の揺れを成分表に当てる', () => {
  const a = app();
  const n = x => a.$(`(nutrFood(${JSON.stringify(x)}) || {names:["なし"]}).names[0]`);
  assert.equal(n('冷凍鶏胸肉'), '鶏むね肉');
  assert.equal(n('冷凍ささがきごぼう'), 'ごぼう');
  assert.equal(n('冷凍むきえび'), 'えび');
  assert.equal(n('冷凍銀鮭'), '銀鮭');
  assert.equal(n('冷凍鮭'), '鮭');
  assert.equal(n('すりごま'), 'ごま');
  assert.equal(n('ごま油'), 'ごま油');
  assert.equal(n('生姜チューブ'), 'しょうが');
  assert.equal(n('柚子胡椒'), '柚子胡椒');
  assert.equal(n('塩・こしょう'), '塩');
  assert.equal(n('ドラゴンフルーツ'), 'なし');
});
test('材料のgを変えるとPFCが変わり、注記は残る', () => {
  const a = app();
  const id = 'seed-sal1';
  const before = norm(a.$(`recipePfc(getRecipe("${id}"))`));
  a.$(`setIngGrams(getRecipe("${id}"), 0, 150); save()`); // 冷凍鮭 100g → 150g
  const after = norm(a.$(`recipePfc(getRecipe("${id}"))`));
  assert.equal(a.$(`getRecipe("${id}").ingredients[0].amount`), '150g');
  assert.equal(Math.round((after.p - before.p) * 10) / 10, 11); // 鮭50g分 22.3×0.5
  a.$('setIngGrams(getRecipe("seed-c4m1"), 5, 200)'); // 冷凍鶏胸肉|300g（一口大）
  assert.equal(a.$('getRecipe("seed-c4m1").ingredients[5].amount'), '200g（一口大）');
  a.$('setIngGrams(getRecipe("seed-chk1"), 0, 300)'); // 鶏むね肉|1枚（約250g）→ g表記の注記は消す
  assert.equal(a.$('getRecipe("seed-chk1").ingredients[0].amount'), '300g');
});
test('何食分で割るかを変えると1食の値が変わる', () => {
  const a = app();
  const two = a.$('recipePfc(getRecipe("seed-c4m1")).p');
  a.$('getRecipe("seed-c4m1").yield = 1');
  assert.ok(Math.abs(a.$('recipePfc(getRecipe("seed-c4m1")).p') - two * 2) <= 1);
  assert.equal(a.$('recipePfc(getRecipe("seed-c4m1")).per'), '全量（2食分）');
});
test('好みの材料は「計算に入れる」にしたときだけ数える', () => {
  const a = app();
  const base = a.$('recipePfc(getRecipe("seed-soup")).salt');
  a.$('getRecipe("seed-soup").ingredients[3].use = true'); // ①赤味噌 大さじ1
  const withMiso = a.$('recipePfc(getRecipe("seed-soup")).salt');
  assert.equal(Math.round((withMiso - base) * 10) / 10, 2.3);
});
test('貼り付けたレシピで材料が全部計算できれば自動計算になる', () => {
  const a = app();
  const r = norm(a.$('(() => { const p = parseRecipeText("## 鶏むね蒸し（2食分）\\n**材料（2食分）**\\n- 鶏むね肉 300g\\n- 醤油 小さじ2\\n**作り方**\\n1. 蒸す"); return { y: parseYield(p.servings), c: computeRecipe(Object.assign(p, { yield: parseYield(p.servings) })) }; })()'));
  assert.equal(r.y, 2);
  assert.equal(r.c.skipped.length, 0);
  assert.equal(r.c.pfc.p, 35); // (300×23.3 + 12×7.7)/100 ÷ 2 = 35.4
});
