import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const app = () => loadApp({ today: '2026-11-25T09:00:00+09:00', storage: {}, expectClean: true });
const parse = (a, t) => norm(a.$(`parseRecipeText(${JSON.stringify(t)})`));

test('Claudeの回答（箇条書きの材料・番号付き手順・目安）を読み取る', () => {
  const t = `## ① 鮭とごぼう・しめじのみそ蒸し（シリコンスチーマー）
水溶性と不溶性の食物繊維が両方取れる組み合わせです。

**材料**
- 冷凍鮭 100g
- 冷凍ささがきごぼう 50g
- しめじ 50g
- 味噌 小さじ2、みりん 小さじ1、おろししょうが少々（混ぜておく）

**作り方**
1. ごぼう、ほうれん草、しめじの順に敷く
2. 鮭をのせて、合わせ味噌を塗る
3. ふたをして600Wで6〜7分

**おかずだけ**：約220kcal／P 28g／F 5g／食物繊維 6.6g`;
  const r = parse(app(), t);
  assert.equal(r.title, '鮭とごぼう・しめじのみそ蒸し（シリコンスチーマー）');
  assert.equal(r.tool, 'シリコンスチーマー');
  assert.deepEqual(r.ingredients.map(i => i.name), ['冷凍鮭', '冷凍ささがきごぼう', 'しめじ', '味噌', 'みりん', 'おろししょうが']);
  assert.equal(r.ingredients[0].amount, '100g');
  assert.equal(r.steps.length, 3);
  assert.equal(r.steps[0], 'ごぼう、ほうれん草、しめじの順に敷く');
  assert.match(r.nutrition, /220kcal/);
  assert.ok(r.tags.includes('鮭') && r.tags.includes('スチーマー'));
});
test('1行にまとめた材料（読点区切り・括弧内の読点は切らない）を読み取る', () => {
  const t = `## 1. ほうれん草とにんじんのナムル（副菜・10分）
**材料（2人分）**：ほうれん草1束（200g）、にんじん1/2本、ごま油小さじ2、豚こま100g（なくても可）

1. にんじんは細切りにする。
2. 調味料を全部合わせて和える。

💡 作り置きなら冷蔵3日`;
  const r = parse(app(), t);
  assert.equal(r.title, 'ほうれん草とにんじんのナムル（副菜・10分）');
  assert.equal(r.servings, '2人分');
  assert.deepEqual(r.ingredients.map(i => i.name), ['ほうれん草', 'にんじん', 'ごま油', '豚こま']);
  assert.equal(r.ingredients[0].amount, '1束（200g）');
  assert.equal(r.ingredients[3].optional, true);
  assert.equal(r.steps.length, 2);
  assert.match(r.notes, /冷蔵3日/);
});
test('空や無関係な文章でも落ちない', () => {
  const a = app();
  assert.equal(parse(a, '').ingredients.length, 0);
  parse(a, 'こんにちは');
});
test('汁物・サラダのタグは料理名で決める', () => {
  const a = app();
  const tags = id => norm(a.$(`S.recipes.find(r => r.id === "${id}").tags`));
  assert.ok(!tags('seed-veg1').includes('汁物'));
  assert.ok(!tags('seed-salad1').includes('汁物'));
  assert.ok(tags('seed-salad1').includes('サラダ'));
  assert.ok(tags('seed-veg3').includes('汁物'));
  assert.ok(!tags('seed-chk1').includes('サラダ'));
});
