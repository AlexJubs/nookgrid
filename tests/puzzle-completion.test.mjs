import test from 'node:test';
import assert from 'node:assert/strict';
import {hasPuzzleCompletion, restoreProgress, movePlace} from '../public/state.mjs';

const ids = ['bakery','cafe','books','florist','park','pond','homes','bikes','market'];
const empty = Array(9).fill(null);
const serialize = progress => JSON.stringify(progress);

test('dated saves retain completion after Reset, Undo and replay', () => {
  const date = '2026-09-18';
  const saves = new Map([[date,serialize({board:ids,reported:true,moves:12})]]);
  assert.equal(hasPuzzleCompletion(saves.get(date),ids,ids),true);
  const progress = restoreProgress(saves.get(date),ids,ids);
  for (const board of [empty,ids.slice().reverse(),movePlace(empty,'bakery',0),ids]) {
    progress.board = [...board];
    saves.set(date,serialize(progress));
    assert.equal(hasPuzzleCompletion(saves.get(date),ids,ids),true);
  }
  assert.equal(saves.size,1);
});

test('a legacy solved board counts without inventing completion for a partial or incorrect board', () => {
  assert.equal(hasPuzzleCompletion(serialize({board:ids}),ids,ids),true);
  for (const board of [empty,movePlace(empty,'bakery',0),ids.slice().reverse()]) {
    assert.equal(hasPuzzleCompletion(serialize({board,reported:false}),ids,ids),false);
  }
  assert.equal(hasPuzzleCompletion(serialize({board:empty}),ids,empty),false);
  assert.equal(hasPuzzleCompletion(serialize({board:empty}),ids),false);
});

test('malformed saves cannot claim historical completion', () => {
  for (const raw of [null,'{bad','null','[]',serialize({board:['bakery'],reported:true}),serialize({board:[...ids.slice(0,8),'bakery'],reported:true})]) {
    assert.equal(hasPuzzleCompletion(raw,ids,ids),false);
  }
  for (const reported of [1,'true',{},null]) {
    assert.equal(hasPuzzleCompletion(serialize({board:empty,reported}),ids,ids),false);
  }
});
