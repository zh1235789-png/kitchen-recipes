import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const T = '2026-11-25T09:00:00+09:00';
const app = () => loadApp({ today: T, storage: {}, expectClean: true });

test('在庫とレシピの名前の揺れを同じものと見なす', () => {
  const a = app();
  const m = (x, y) => a.$(`nameMatch(${JSON.stringify(x)}, ${JSON.stringify(y)})`);
  assert.ok(m('鶏むね肉', '冷凍鶏胸肉'));
  assert.ok(m('冷凍鮭', '冷凍銀鮭'));
  assert.ok(m('ニンニクチューブ', 'おろしにんにく'));
  assert.ok(m('生姜チューブ', 'おろししょうが'));
  assert.ok(m('すりごま', 'ごま'));
  assert.ok(m('味噌', '赤味噌'));
  assert.ok(m('カットトマト', 'トマト缶'));
  assert.ok(m('卵', '生卵'));
});
test('別物は同じと見なさない', () => {
  const a = app();
  const m = (x, y) => a.$(`nameMatch(${JSON.stringify(x)}, ${JSON.stringify(y)})`);
  assert.ok(!m('ごま油', 'ごま'));
  assert.ok(!m('ブロッコリースーパースプラウト', '冷凍ブロッコリー'));
  assert.ok(!m('さば水煮缶', 'さば缶味噌'));
  assert.ok(!m('コンソメ', '醤油'));
});
test('初期データの在庫だけで作れるレシピがあり、足りないものも正しく出る', () => {
  const a = app();
  const can = a.$('S.recipes.filter(r => recipeCheck(r).missing.length === 0).map(r => r.title)');
  assert.ok(can.includes('さば味噌キムチ雑炊'), JSON.stringify(can));
  assert.ok(can.includes('基本のサラダチキン'));
  const miss = norm(a.$('recipeCheck(S.recipes.find(r => r.title === "えびの酒蒸し")).missing.map(x => x.ing.name)'));
  assert.deepEqual(miss, ['冷凍むきえび']);
});
test('在庫を「なし」にするとそのレシピは作れなくなり、買い物リストに出る', () => {
  const a = app();
  a.$('setFoodStatus(S.foods.find(f => f.name === "キムチ").id, "low")');
  assert.equal(a.$('S.foods.find(f => f.name === "キムチ").status'), 'low');
  a.$('setFoodStatus(S.foods.find(f => f.name === "キムチ").id, "out")');
  const miss = norm(a.$('recipeCheck(S.recipes.find(r => r.title === "さば味噌キムチ雑炊")).missing.map(x => x.ing.name)'));
  assert.deepEqual(miss, ['キムチ']);
  assert.ok(a.$('shopItems().some(x => x.name === "キムチ")'));
  a.$('boughtFood(S.foods.find(f => f.name === "キムチ").id)');
  assert.ok(!a.$('shopItems().some(x => x.name === "キムチ")'));
  // 保存されている
  assert.equal(JSON.parse(a.__store['kitchen.v1']).foods.find(f => f.name === 'キムチ').status, 'have');
});
test('不足を買い物へ→買った→食材に入る', () => {
  const a = app();
  const n = a.$('missingToShop(S.recipes.find(r => r.title === "えびの酒蒸し"))');
  assert.equal(n, 1);
  assert.ok(a.$('S.shop.some(x => x.name === "冷凍むきえび")'));
  a.$('S.shop.forEach(x => x.done = true)');
  a.$('shopToStock()');
  assert.equal(a.$('S.shop.length'), 0);
  const f = norm(a.$('S.foods.find(f => f.name === "冷凍むきえび")'));
  assert.equal(f.place, '冷凍'); assert.equal(f.status, 'have');
  assert.equal(a.$('recipeCheck(S.recipes.find(r => r.title === "えびの酒蒸し")).missing.length'), 0);
});
test('同じ名前の食材を追加すると重複せず「あり」に戻る', () => {
  const a = app();
  const before = a.$('S.foods.length');
  a.$('S.foods.find(f => f.name === "納豆").status = "out"');
  a.$('addFood("納豆", "冷蔵")');
  assert.equal(a.$('S.foods.length'), before);
  assert.equal(a.$('S.foods.find(f => f.name === "納豆").status'), 'have');
});
test('書き出したJSONを取り込むと元に戻る', () => {
  const a = app();
  a.$('addFood("しめじ", "冷蔵")');
  const json = a.$('exportJson()');
  const b = app();
  assert.equal(b.$(`importJson(${JSON.stringify(json)})`), '');
  assert.ok(b.$('S.foods.some(f => f.name === "しめじ")'));
  assert.notEqual(b.$('importJson("{}")'), '');
});
test('消した初期レシピを戻せる', () => {
  const a = app();
  const n0 = a.$('S.recipes.length');
  a.$('S.recipes = S.recipes.slice(2)');
  assert.equal(a.$('restoreSeed()'), 2);
  assert.equal(a.$('S.recipes.length'), n0);
});
test('味噌は「さば缶味噌」でなく「赤味噌」に当てる', () => {
  const a = app();
  assert.equal(a.$('findFood("味噌").name'), '赤味噌');
  assert.ok(!a.$('nameMatch("味噌", "さば缶味噌")'));
});
test('同じ名前の候補が複数あれば在庫ありを優先する', () => {
  const a = app();
  a.$('S.foods.push({id:"x1",name:"銀鮭",place:"冷蔵",status:"out",exp:"",memo:""})');
  assert.equal(a.$('findFood("冷凍鮭").status'), 'have');
});
test('在庫の状態を選んでも並び順は変わらず、ボタンで直接選べる', () => {
  const a = app();
  const order = () => norm(a.$('S.foods.filter(f => f.place === "冷蔵").sort(foodOrder).map(f => f.name)'));
  const before = order();
  a.$('setFoodStatus("seed-f-キムチ", "low")');
  assert.equal(a.$('S.foods.find(f => f.name === "キムチ").status'), 'low');
  assert.deepEqual(order(), before);
  a.$('setFoodStatus("seed-f-キムチ", "out")');
  assert.deepEqual(order(), before);
  assert.ok(a.$('shopItems().some(x => x.name === "キムチ")'));
  a.$('setFoodStatus("seed-f-キムチ", "have")');
  assert.equal(a.$('S.foods.find(f => f.name === "キムチ").status'), 'have');
  a.$('setFoodStatus("seed-f-キムチ", "bogus")');
  assert.equal(a.$('S.foods.find(f => f.name === "キムチ").status'), 'have');
});
