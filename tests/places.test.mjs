import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, norm } from './harness.mjs';

const T = '2026-11-26T09:00:00+09:00';
const old = (foods) => JSON.stringify({ v: 5, foods, recipes: [], shop: [], deleted: {} });
const f = (id, name, place, status = 'have') => ({ id, name, place, status, exp: '', memo: '', updated: 1 });

test('前の版の生野菜（冷蔵・常温）は「野菜・果物」へ移り、加工品はそのまま', () => {
  const a = loadApp({ today: T, storage: { 'kitchen.v1': old([
    f('a', 'たまねぎ', '常温'), f('b', 'レモン', '常温'), f('c', 'レモン汁', '調味料'), f('d', 'しめじ', '冷蔵'),
    f('e', '冷凍ブロッコリー', '冷凍'), f('g', 'かぼちゃの種', '常温'), f('h', 'おろししょうが', '調味料'), f('i', 'トマト缶', '常温'),
    f('j', '卵', '冷蔵'), f('k', 'なにか', '謎の場所'),
  ]) }, expectClean: true });
  const place = id => a.$(`S.foods.find(x => x.id === ${JSON.stringify(id)}).place`);
  assert.equal(place('a'), '野菜・果物');
  assert.equal(place('b'), '野菜・果物');
  assert.equal(place('d'), '野菜・果物');
  assert.equal(place('c'), '調味料');
  assert.equal(place('e'), '冷凍');
  assert.equal(place('g'), '常温');
  assert.equal(place('h'), '調味料');
  assert.equal(place('i'), '常温');
  assert.equal(place('j'), '冷蔵');
  assert.equal(place('k'), '冷蔵', '知らない場所は名前から推定');
  assert.equal(a.$('S.foods.find(x => x.id === "a").updated'), 1, '移しても時刻は変えない（同期で他の変更を上書きしない）');
});

test('移したあと本人が常温に戻したら、読み込み直しても同期しても戻さない', () => {
  const a = loadApp({ today: T, storage: { 'kitchen.v1': old([f('a', 'たまねぎ', '常温')]) }, expectClean: true });
  a.$('S.foods[0].place = "常温"; S.foods[0].updated = 5; save()');
  a.$('mergeRemote({ app: "kitchen-recipes", v: 5, foods: [], recipes: [], shop: [], deleted: {} })');
  assert.equal(a.$('S.foods[0].place'), '常温');
});

test('古い版の端末から同期で来た生野菜も振り分ける', () => {
  const a = loadApp({ today: T, storage: {}, expectClean: true });
  a.$(`mergeRemote({ app: "kitchen-recipes", v: 5, foods: [${JSON.stringify(f('z', 'キャベツ', '冷蔵'))}].map(x => Object.assign(x, { updated: Date.now() + 9 })), recipes: [], shop: [], deleted: {} })`);
  assert.equal(a.$('S.foods.find(x => x.id === "z").place'), '野菜・果物');
});

test('新しく足す食材の場所の推定', () => {
  const a = loadApp({ today: T, storage: {}, expectClean: true });
  assert.equal(a.$('guessPlace("ほうれん草")'), '野菜・果物');
  assert.equal(a.$('guessPlace("冷凍ほうれん草")'), '冷凍');
  assert.equal(a.$('guessPlace("ポン酢")'), '調味料');
  assert.equal(a.$('addFood("エリンギ", "").place'), '野菜・果物');
});

test('「すべて」では「あり」の調味料をたたみ、少ない・なしだけ出す。開く・調味料タブ・検索では全部出す', () => {
  const a = loadApp({ today: T, storage: { 'kitchen.v1': old([
    f('s1', '醤油', '調味料'), f('s2', 'みりん', '調味料', 'low'), f('s3', 'ケチャップ', '調味料', 'out'), f('s4', '砂糖', '調味料'), f('v1', '卵', '冷蔵'),
  ]) }, expectClean: true });
  let h = a.$('foodListHtml()');
  assert.ok(h.includes('みりん') && h.includes('ケチャップ') && h.includes('卵'));
  assert.ok(!h.includes('醤油') && !h.includes('砂糖'));
  assert.ok(h.includes('残りの調味料 2品を表示'));
  a.$('UI.spiceOpen = true'); h = a.$('foodListHtml()');
  assert.ok(h.includes('醤油') && h.includes('たたむ'));
  a.$('UI.spiceOpen = false; UI.place = "調味料"'); h = a.$('foodListHtml()');
  assert.ok(h.includes('醤油') && !h.includes('残りの調味料'));
  a.$('UI.place = "all"; UI.foodQ = "醤油"'); h = a.$('foodListHtml()');
  assert.ok(h.includes('醤油'));
});

test('調味料が全部「あり」なら、その旨を出して開くボタンを置く', () => {
  const a = loadApp({ today: T, storage: { 'kitchen.v1': old([f('s1', '醤油', '調味料')]) }, expectClean: true });
  const h = a.$('foodListHtml()');
  assert.ok(h.includes('切れているものはありません') && h.includes('残りの調味料 1品'));
});
