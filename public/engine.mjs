export const PLACES = ['Bakery', 'Cafe', 'Books', 'Florist', 'Park', 'Pond', 'Homes', 'Bikes', 'Market']
  .map(name => ({ id: name.toLowerCase(), name }));

const ids = PLACES.map(place => place.id);
const names = Object.fromEntries(PLACES.map(place => [place.id, place.name]));
const unary = ['row', 'column', 'corner'];
const binary = ['left', 'above', 'adjacent', 'sameRow', 'sameColumn'];
const cells = Array.from({ length: 9 }, (_, index) => index);

function validClue(clue) {
  if (!clue || !ids.includes(clue.a)) return false;
  if (clue.type === 'corner') return true;
  if (clue.type === 'row' || clue.type === 'column') return [0, 1, 2].includes(clue.value);
  return binary.includes(clue.type) && ids.includes(clue.b) && clue.a !== clue.b;
}

function validBoard(board) {
  if (!Array.isArray(board) || board.length !== 9) return false;
  const filled = Array.from(board).filter(value => value !== null);
  return filled.every(value => ids.includes(value)) && new Set(filled).size === filled.length;
}

function matches(clue, a, b) {
  const rowA = Math.floor(a / 3), rowB = Math.floor(b / 3);
  const colA = a % 3, colB = b % 3;
  switch (clue.type) {
    case 'row': return rowA === clue.value;
    case 'column': return colA === clue.value;
    case 'corner': return [0, 2, 6, 8].includes(a);
    case 'left': return rowA === rowB && colA + 1 === colB;
    case 'above': return colA === colB && rowA < rowB;
    case 'adjacent': return Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1;
    case 'sameRow': return rowA === rowB;
    case 'sameColumn': return colA === colB;
    default: return false;
  }
}

export function clueText(clue) {
  if (!validClue(clue)) return 'Unknown clue.';
  const a = names[clue.a], b = names[clue.b];
  switch (clue.type) {
    case 'row': return `${a} is in the ${['top', 'middle', 'bottom'][clue.value]} row.`;
    case 'column': return `${a} is in the ${['left', 'middle', 'right'][clue.value]} column.`;
    case 'corner': return `${a} is in a corner.`;
    case 'left': return `${a} is directly left of ${b}.`;
    case 'above': return `${a} is above ${b} in the same column.`;
    case 'adjacent': return `${a} touches sides with ${b}.`;
    case 'sameRow': return `${a} and ${b} are in the same row.`;
    case 'sameColumn': return `${a} and ${b} are in the same column.`;
  }
}

export function clueStatus(clue, board) {
  if (!validBoard(board) || !validClue(clue)) return 'conflict';
  const a = board.indexOf(clue.a), b = board.indexOf(clue.b);
  if (a === -1 || (binary.includes(clue.type) && b === -1)) return 'pending';
  return matches(clue, a, b) ? 'met' : 'conflict';
}

export function isSolved(puzzle, board) {
  return validBoard(board) && !board.includes(null) && Array.isArray(puzzle?.clues)
    && puzzle.clues.every(clue => clueStatus(clue, board) === 'met');
}

export function solve(clues, limit = 2) {
  if (!Array.isArray(clues) || !clues.every(validClue) || !Number.isSafeInteger(limit) || limit < 1) return [];
  const positions = Array(9).fill(-1), occupied = Array(9).fill(false), solutions = [];
  const related = ids.map(id => clues.filter(clue => clue.a === id || clue.b === id));
  const domains = ids.map(id => cells.filter(cell => clues.every(clue =>
    clue.a !== id || !unary.includes(clue.type) || matches(clue, cell))));
  const order = cells.slice().sort((a, b) => domains[a].length - domains[b].length || related[b].length - related[a].length);
  function possible(clue) {
    const a = positions[ids.indexOf(clue.a)], b = positions[ids.indexOf(clue.b)];
    if (unary.includes(clue.type)) return matches(clue, a);
    if (a >= 0 && b >= 0) return matches(clue, a, b);
    const missing = ids.indexOf(a < 0 ? clue.a : clue.b);
    return domains[missing].some(cell => !occupied[cell] && matches(clue, a < 0 ? cell : a, b < 0 ? cell : b));
  }
  function visit(depth) {
    if (depth === 9) {
      const board = Array(9);
      positions.forEach((cell, place) => { board[cell] = ids[place]; });
      solutions.push(board);
      return;
    }
    const place = order[depth];
    for (const cell of domains[place]) {
      if (occupied[cell]) continue;
      positions[place] = cell;
      occupied[cell] = true;
      if (related[place].every(possible)) visit(depth + 1);
      positions[place] = -1;
      occupied[cell] = false;
      if (solutions.length >= limit) return;
    }
  }
  visit(0);
  return solutions;
}
