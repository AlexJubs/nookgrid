export function validBoard(board, ids) {
  return Array.isArray(board) && board.length === 9 && board.every(id => id === null || ids.includes(id)) && new Set(board.filter(Boolean)).size === board.filter(Boolean).length;
}

export function movePlace(board, id, target) {
  if (target !== null && (!Number.isInteger(target) || target < 0 || target > 8)) throw new RangeError('Choose a lot inside the grid.');
  const next = [...board], source = next.indexOf(id);
  if (source >= 0) next[source] = target === null ? null : next[target];
  if (target !== null) next[target] = id;
  return next;
}

export function selectPuzzle(bank, today, requested) {
  if (requested === 'practice') return {puzzle:bank.tutorial,mode:'practice'};
  const archive = requested && requested <= today && bank.puzzles.find(puzzle => puzzle.date === requested);
  const puzzle = archive || bank.puzzles.find(puzzle => puzzle.date === today);
  return puzzle ? {puzzle,mode:puzzle.date === today ? 'daily' : 'archive'} : {puzzle:bank.tutorial,mode:'practice'};
}

export function nextPuzzleCountdown(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24,0,0,0);
  const remainingSeconds = Math.ceil((nextMidnight - now) / 1000);
  return [Math.floor(remainingSeconds / 3600),Math.floor(remainingSeconds / 60) % 60,remainingSeconds % 60].map(value => String(value).padStart(2,'0')).join(':');
}

export function restoreHintedPlaces(board, hintedPlaces, solution) {
  const next = board.map(id => hintedPlaces.includes(id) ? null : id);
  for (const id of hintedPlaces) next[solution.indexOf(id)] = id;
  return next;
}

export function restoreProgress(raw, ids, solution) {
  const clean = {board:Array(9).fill(null),moves:0,hints:0,hintedPlaces:[],reported:false,elapsedMs:0};
  try {
    const saved = JSON.parse(raw);
    if (!validBoard(saved?.board, ids)) return clean;
    const count = n => Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0;
    const hintedPlaces = Array.isArray(saved.hintedPlaces) && validBoard(solution,ids) && solution.every(Boolean) ? [...new Set(saved.hintedPlaces.filter(id => ids.includes(id)))] : [];
    const board = restoreHintedPlaces(saved.board,hintedPlaces,solution);
    const elapsedMs = !board.some(Boolean) ? 0 : Number.isFinite(saved.elapsedMs) && saved.elapsedMs >= 0 && saved.elapsedMs <= Number.MAX_SAFE_INTEGER ? saved.elapsedMs : null;
    return {board,moves:count(saved.moves),hints:Math.max(count(saved.hints),hintedPlaces.length),hintedPlaces,reported:saved.reported === true,elapsedMs};
  } catch { return clean; }
}

export function advanceSolveTimer(timer, now, hasPlaces, shouldRun) {
  if (!hasPlaces) return {elapsedMs:0,startedAt:null};
  const elapsedMs = timer.elapsedMs === null ? null : timer.elapsedMs + (timer.startedAt === null ? 0 : Math.max(0,now - timer.startedAt));
  return {elapsedMs,startedAt:shouldRun && elapsedMs !== null ? now : null};
}

export function formatSolveTime(elapsedMs) {
  if (!elapsedMs) return '';
  const seconds = Math.ceil(elapsedMs / 1000), hours = Math.floor(seconds / 3600);
  return `${hours ? `${hours}:${String(Math.floor(seconds / 60) % 60).padStart(2,'0')}` : Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
}

export function shareText(date, hints, base) {
  const label = date === 'tutorial' ? 'Practice' : new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  const link = new URL(base);
  link.search = date === 'tutorial' ? '?date=practice' : `?date=${date}`;
  link.searchParams.set('utm_source','share');
  link.searchParams.set('utm_medium','result');
  link.searchParams.set('utm_campaign','daily');
  link.searchParams.set('utm_content','result_card');
  link.hash = '';
  return `NookGrid · ${label}\n🏡 A little neighborhood, all in place.\n${hints ? `Solved with ${hints} hint${hints === 1 ? '' : 's'}.` : 'Solved without hints.'}\n${link.href}`;
}
