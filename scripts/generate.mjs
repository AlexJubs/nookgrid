import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PLACES, clueStatus, solve } from '../public/engine.mjs';

export function generateBank() {
  let seed = 0x4e6f6f6b;
  const ids = PLACES.map(place => place.id), puzzles = [], seen = new Set();
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function shuffle(items) {
    const result = items.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  // ponytail: 90-day calendar; extend the verified bank when fewer than 14 days remain.
  for (let attempt = 0; puzzles.length < 90 && attempt < 10000; attempt++) {
    const solution = shuffle(ids);
    if (seen.has(solution.join(','))) continue;
    const anchors = ids.flatMap(a => [
      { type: 'corner', a },
      ...[0, 1, 2].flatMap(value => [{ type: 'row', a, value }, { type: 'column', a, value }]),
    ]).filter(clue => clueStatus(clue, solution) === 'met');
    const relations = ids.flatMap((a, index) => ids.flatMap((b, other) =>
      ['left', 'above', 'adjacent', 'sameRow', 'sameColumn']
        .filter(type => index !== other && (['left', 'above'].includes(type) || index < other))
        .map(type => ({ type, a, b })))).filter(clue => clueStatus(clue, solution) === 'met');
    let clues = shuffle([...shuffle(anchors).slice(0, 3), ...relations]);
    for (const clue of clues.slice()) {
      const reduced = clues.filter(candidate => candidate !== clue);
      if (solve(reduced).length === 1) clues = reduced;
    }
    if (clues.length < 7 || clues.length > 11 || new Set(clues.map(clue => clue.type)).size < 3) continue;
    clues.sort((a, b) => Number(Boolean(a.b)) - Number(Boolean(b.b)));
    const date = new Date(Date.UTC(2026, 8, 10 + puzzles.length)).toISOString().slice(0, 10);
    puzzles.push({ date, clues, solution });
    seen.add(solution.join(','));
  }
  if (puzzles.length !== 90) throw new Error('Could not generate the complete puzzle calendar.');
  return {
    version: 1,
    startDate: '2026-09-10',
    puzzles,
    tutorial: {
      date: 'tutorial',
      clues: [
        { type: 'row', a: 'bakery', value: 0 },
        { type: 'column', a: 'bakery', value: 0 },
        { type: 'left', a: 'bakery', b: 'cafe' },
        { type: 'left', a: 'cafe', b: 'books' },
        { type: 'left', a: 'florist', b: 'park' },
        { type: 'left', a: 'park', b: 'pond' },
        { type: 'above', a: 'florist', b: 'homes' },
        { type: 'left', a: 'homes', b: 'bikes' },
        { type: 'left', a: 'bikes', b: 'market' },
      ],
      solution: ids,
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = generateBank();
  writeFileSync(new URL('../public/puzzles.json', import.meta.url), `${JSON.stringify(bank, null, 2)}\n`);
  console.log(`Generated ${bank.puzzles.length} puzzles through ${bank.puzzles.at(-1).date}.`);
}
