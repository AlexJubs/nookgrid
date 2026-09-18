import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PLACES, clueStatus, clueText, isSolved, solve } from '../public/engine.mjs';
import { generateBank } from '../scripts/generate.mjs';

const board = ['bakery', 'cafe', 'books', 'florist', 'park', 'pond', 'homes', 'bikes', 'market'];
const fixtures = [
  [{ type: 'row', a: 'bakery', value: 0 }, 'met'],
  [{ type: 'row', a: 'bakery', value: 1 }, 'conflict'],
  [{ type: 'column', a: 'cafe', value: 1 }, 'met'],
  [{ type: 'column', a: 'cafe', value: 2 }, 'conflict'],
  [{ type: 'corner', a: 'bakery' }, 'met'],
  [{ type: 'corner', a: 'park' }, 'conflict'],
  [{ type: 'left', a: 'bakery', b: 'cafe' }, 'met'],
  [{ type: 'left', a: 'books', b: 'florist' }, 'conflict'],
  [{ type: 'left', a: 'bakery', b: 'books' }, 'conflict'],
  [{ type: 'above', a: 'bakery', b: 'homes' }, 'met'],
  [{ type: 'above', a: 'homes', b: 'bakery' }, 'conflict'],
  [{ type: 'above', a: 'bakery', b: 'bikes' }, 'conflict'],
  [{ type: 'adjacent', a: 'cafe', b: 'park' }, 'met'],
  [{ type: 'adjacent', a: 'bakery', b: 'park' }, 'conflict'],
  [{ type: 'adjacent', a: 'books', b: 'florist' }, 'conflict'],
  [{ type: 'sameRow', a: 'bakery', b: 'books' }, 'met'],
  [{ type: 'sameRow', a: 'bakery', b: 'florist' }, 'conflict'],
  [{ type: 'sameColumn', a: 'bakery', b: 'homes' }, 'met'],
  [{ type: 'sameColumn', a: 'bakery', b: 'cafe' }, 'conflict'],
];

test('clues distinguish literal positions, directions, and side adjacency', () => {
  assert.deepEqual(PLACES.map(place => place.id), board);
  for (const [clue, status] of fixtures) {
    assert.equal(clueStatus(clue, board), status, JSON.stringify(clue));
    assert.equal(clueStatus(clue, Array(9).fill(null)), 'pending');
    assert.doesNotMatch(clueText(clue), /undefined|—|--/);
  }
  assert.match(clueText({ type: 'above', a: 'bakery', b: 'homes' }), /above.*same column/);
  assert.match(clueText({ type: 'left', a: 'bakery', b: 'cafe' }), /directly left/);
  assert.match(clueText({ type: 'adjacent', a: 'bakery', b: 'cafe' }), /touches sides/);
});

test('a win requires nine distinct known places and every clue satisfied', () => {
  const clue = { type: 'row', a: 'bakery', value: 0 };
  const puzzle = { clues: [clue] };
  assert.equal(isSolved(puzzle, board), true);
  for (const invalid of [null, [], board.slice(1), [...board, null], Array(9).fill('bakery'), ['alien', ...board.slice(1)], [undefined, ...board.slice(1)]]) {
    assert.equal(isSolved(puzzle, invalid), false);
    assert.equal(clueStatus(clue, invalid), 'conflict');
  }
  assert.equal(isSolved(puzzle, [null, ...board.slice(1)]), false);
  assert.equal(isSolved({ clues: [{ ...clue, value: 1 }] }, board), false);
  assert.equal(isSolved({ clues: [{ type: 'madeUp', a: 'bakery' }] }, board), false);
});

test('solver finds a hand-derived unique grid and obeys its solution limit', () => {
  const clues = [
    { type: 'row', a: 'bakery', value: 0 },
    { type: 'column', a: 'bakery', value: 0 },
    { type: 'left', a: 'bakery', b: 'cafe' },
    { type: 'left', a: 'cafe', b: 'books' },
    { type: 'left', a: 'florist', b: 'park' },
    { type: 'left', a: 'park', b: 'pond' },
    { type: 'above', a: 'florist', b: 'homes' },
    { type: 'left', a: 'homes', b: 'bikes' },
    { type: 'left', a: 'bikes', b: 'market' },
  ];
  assert.deepEqual(solve(clues), [board]);
  assert.equal(solve([]).length, 2);
  assert.equal(solve([], 1).length, 1);
  assert.deepEqual(solve([], 0), []);
  assert.deepEqual(solve([{ type: 'row', a: 'bakery', value: 3 }]), []);
  assert.deepEqual(solve([{ type: 'left', a: 'bakery', b: 'bakery' }]), []);
  assert.deepEqual(solve([...clues, { type: 'row', a: 'bakery', value: 2 }]), []);
});

function exhaustiveSolutions(clues) {
  const rows = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
  const columns = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];
  const left = [[0, 1], [1, 2], [3, 4], [4, 5], [6, 7], [7, 8]];
  const vertical = [[0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8]];
  const sameGroup = groups => groups.flatMap(group => group.flatMap(a => group.map(b => [a, b])));
  const rules = clues.map(clue => {
    const tables = {
      row: (rows[clue.value] ?? []).map(a => [a, a]),
      column: (columns[clue.value] ?? []).map(a => [a, a]),
      corner: [0, 2, 6, 8].map(a => [a, a]),
      left,
      above: [...vertical, [0, 6], [1, 7], [2, 8]],
      adjacent: [...left, ...vertical].flatMap(([a, b]) => [[a, b], [b, a]]),
      sameRow: sameGroup(rows),
      sameColumn: sameGroup(columns),
    };
    return { a: board.indexOf(clue.a), b: board.indexOf(clue.b ?? clue.a), allowed: new Set(tables[clue.type].map(([a, b]) => a * 9 + b)) };
  });
  const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8], solutions = [];
  function permute(index) {
    if (index === 9) {
      if (rules.every(rule => rule.allowed.has(positions[rule.a] * 9 + positions[rule.b]))) {
        const solution = Array(9);
        positions.forEach((cell, place) => { solution[cell] = board[place]; });
        solutions.push(solution);
      }
      return;
    }
    for (let next = index; next < 9; next++) {
      [positions[index], positions[next]] = [positions[next], positions[index]];
      permute(index + 1);
      [positions[index], positions[next]] = [positions[next], positions[index]];
    }
  }
  permute(0);
  return solutions;
}

test('generator preserves published puzzles and ships ten years of unique consecutive daily puzzles', () => {
  const bank = generateBank();
  assert.deepEqual(generateBank(), bank);
  assert.equal(readFileSync(new URL('../public/puzzles.json', import.meta.url), 'utf8'), `${JSON.stringify(bank, null, 2)}\n`);
  assert.equal(bank.version, 1);
  assert.equal(bank.startDate, '2026-09-10');
  assert.equal(bank.puzzles.length, 3660);
  assert.equal(bank.puzzles.at(-1).date, '2036-09-16');
  assert.equal(new Set([...bank.puzzles, bank.tutorial].map(puzzle => puzzle.solution.join(','))).size, 3661);
  assert.equal(createHash('sha256').update(JSON.stringify(bank.puzzles.slice(0, 90))).digest('hex'), '21cf6d7a056bd306aea03b78ff22f0705fcd773cd20bb2145fb8ff639bdb7712');
  assert.equal(createHash('sha256').update(JSON.stringify(bank.tutorial)).digest('hex'), 'e53077c47c014d106b334b3d6fa4c95c11f7d1aa3747d1ee18615231e36274ca');
  bank.puzzles.forEach((puzzle, index) => {
    assert.equal(puzzle.date, new Date(Date.UTC(2026, 8, 10 + index)).toISOString().slice(0, 10));
    assert.ok(puzzle.clues.length >= 7 && puzzle.clues.length <= 11, puzzle.date);
    assert.ok(puzzle.clues.filter(clue => ['row', 'column', 'corner'].includes(clue.type)).length <= 3);
    assert.ok(new Set(puzzle.clues.map(clue => clue.type)).size >= 3);
  });
});

test('all daily and tutorial puzzles have one solution under an independent exhaustive validator', () => {
  const bank = JSON.parse(readFileSync(new URL('../public/puzzles.json', import.meta.url)));
  assert.equal(bank.tutorial.date, 'tutorial');
  for (const puzzle of [...bank.puzzles, bank.tutorial]) {
    assert.deepEqual(exhaustiveSolutions(puzzle.clues), [puzzle.solution], puzzle.date);
    assert.deepEqual(solve(puzzle.clues), [puzzle.solution], puzzle.date);
    assert.equal(isSolved(puzzle, puzzle.solution), true, puzzle.date);
  }
});
