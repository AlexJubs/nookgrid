import { PLACES, clueText, clueStatus, isSolved } from './engine.mjs?v=20260915-teaser1';
import { movePlace, selectPuzzle, restoreProgress, hasPuzzleCompletion, shareText, nextPuzzleCountdown, advanceSolveTimer, formatSolveTime, restoreHintedPlaces, puzzleDay, restoreStreakDays, addDailyCompletion, streakLength } from './state.mjs?v=20260924-calendar2';
import { placeArt } from './art.mjs?v=20260915-teaser1';
import { testMode, analytics } from './session.mjs?v=20260924-calendar2';
import { native, savedValue, saveValue } from './platform.mjs';
import { updatePuzzleLinks } from './navigation.mjs?v=20260924-calendar2';
import { getWeekDates, getCalendarMonths, renderCalendar } from './calendar.mjs?v=20260924-calendar3';

const $ = id => document.getElementById(id);
const renderIcon = (name, className = '') => `<svg class="ui-icon ${className}" width="24" height="24" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false"><use href="./icons.svg?v=20260924-calendar2#${name}"/></svg>`;
const ids = PLACES.map(place => place.id);
const nameOf = id => PLACES.find(place => place.id === id)?.name || '';
const openedDay = puzzleDay();
let today = openedDay;
const params = new URLSearchParams(location.search);
const progressPrefix = testMode ? 'nookgrid:test:v1:' : 'nookgrid:v1:';
const streakKey = `${progressPrefix}streak`;
let streakDays = restoreStreakDays(read(streakKey));
let config = {feedbackEnabled:false};
let puzzle, mode, bank, progress, selected = null, history = [], started = false;
let wasSolved = false, feedbackKey = null, feedbackPayload = null;
let hasGuidance = false, shouldShowGuidance = false;
let solveTimer = {elapsedMs:0,startedAt:null};
let screen = 'puzzle';
let calendarMonths = [], calendarMonth;

function read(key) {
  return savedValue(key);
}

function showAppStoreLink(identifier) {
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (native || !isAppleMobile || !matchMedia('(pointer:coarse)').matches || !/^[1-9]\d{5,14}$/.test(String(identifier || ''))) return;
  try { if (sessionStorage.getItem('nookgrid:app-prompt-dismissed') === '1') return; } catch {}
  $('app-store-link').href = `https://apps.apple.com/app/id${identifier}`;
  $('app-store-prompt').hidden = false;
  $('app-store-dismiss').addEventListener('click',() => {
    $('app-store-prompt').hidden = true;
    try { sessionStorage.setItem('nookgrid:app-prompt-dismissed','1'); } catch {}
  });
}

$('retry-save').addEventListener('click', () => save());

async function navigateTo(url) {
  if (native && progress) {
    try {
      if (!await save(false)) throw new Error('Progress was not saved');
      await native.storage?.flush();
    }
    catch {
      save();
      document.querySelector('dialog[open]')?.close();
      $('save-warning').hidden = false;
      return;
    }
  }
  location.assign(url);
}

function openDialog(id, opener) {
  const isFromMenu = $('menu-dialog').open;
  if (isFromMenu) $('menu-dialog').close();
  if (id === 'calendar-dialog' && bank && puzzle) prepareCalendar();
  (isFromMenu ? $('menu-open') : opener).focus({preventScroll:true});
  $(id).showModal();
}
for (const [button, dialog] of [['help-open','help-dialog'],['menu-open','menu-dialog'],['menu-calendar-open','calendar-dialog'],['calendar-open','calendar-dialog'],['result-calendar-open','calendar-dialog'],['feedback-open','feedback-dialog'],['settings-open','settings-dialog'],['hint','hint-dialog']]) {
  $(button).addEventListener('click', () => openDialog(dialog, $(button)));
}
$('help-tutorial').href = `?date=practice${testMode ? '&test=1' : ''}`;

function getCompletedDates() {
  return bank.puzzles.filter(item => item.date <= today && (
    item.date === puzzle.date && (progress.reported || isSolved(puzzle,progress.board)) ||
    hasPuzzleCompletion(read(`${progressPrefix}${item.date}`),ids,item.solution)
  )).map(item => item.date);
}

function prepareCalendar(shouldResetMonth = true) {
  if (!bank || !puzzle) return;
  const dates = bank.puzzles.map(item => item.date);
  calendarMonths = getCalendarMonths(dates.filter(date => date <= today).sort()[0],today);
  if (shouldResetMonth) calendarMonth = (screen === 'home' || mode === 'practice' ? today : puzzle.date).slice(0,7);
  const month = calendarMonths.find(item => item.month === calendarMonth) || calendarMonths[0];
  $('calendar-streak').textContent = `${streakLength(streakDays,today)}-day streak`;
  if (!month) {
    $('calendar-status').textContent = 'No puzzles released yet.';
    $('calendar-status').hidden = false;
    $('calendar-navigation').hidden = true;
    $('calendar-months').hidden = true;
    return;
  }
  calendarMonth = month.month;
  const index = calendarMonths.indexOf(month);
  const focusedDate = $('calendar-months').contains(document.activeElement) ? document.activeElement.dataset.puzzleDate : null;
  $('calendar-month-title').textContent = month.label;
  $('calendar-previous').disabled = index === calendarMonths.length - 1;
  $('calendar-next').disabled = index === 0;
  $('calendar-months').replaceChildren(renderCalendar({
    dates,today,selectedMonth:calendarMonth,completedDates:getCompletedDates(),streakDays,
    currentDate:screen === 'home' ? null : puzzle.date,isTest:testMode
  }));
  if (focusedDate) $('calendar-months').querySelector(`a[data-puzzle-date="${focusedDate}"]`)?.focus({preventScroll:true});
  $('calendar-status').hidden = true;
  $('calendar-navigation').hidden = false;
  $('calendar-months').hidden = false;
}

for (const [id,offset] of [['calendar-previous',1],['calendar-next',-1]]) {
  $(id).addEventListener('click',() => {
    const month = calendarMonths[calendarMonths.findIndex(item => item.month === calendarMonth) + offset];
    if (!month) return;
    const hasFocus = document.activeElement === $(id);
    calendarMonth = month.month;
    prepareCalendar(false);
    if (hasFocus && $(id).disabled) $(offset === 1 ? 'calendar-next' : 'calendar-previous').focus({preventScroll:true});
  });
}

function renderHistory() {
  if (!bank || !puzzle) return;
  const completed = new Set(getCompletedDates());
  const daily = bank.puzzles.find(item => item.date === today);
  const saved = daily ? daily.date === puzzle.date ? progress : restoreProgress(read(`${progressPrefix}${today}`),ids,daily.solution) : null;
  const hasAttempt = saved?.board.some(Boolean) && !isSolved(daily,saved.board);
  const isComplete = completed.has(today);
  const hasFinishedBoard = saved && isSolved(daily,saved.board);
  $('home-streak-count').textContent = streakLength(streakDays,today);
  $('home-play').textContent = hasAttempt ? "Continue today's puzzle" : isComplete ? "Replay today's puzzle" : "Play today's puzzle";
  $('home-play').hidden = Boolean(hasFinishedBoard);
  $('home-play').disabled = !daily;
  $('home-result').hidden = !hasFinishedBoard;
  $('calendar-open').classList.toggle('primary',Boolean(hasFinishedBoard));
  $('calendar-open').classList.toggle('secondary',!hasFinishedBoard);
  $('home-date').textContent = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
  for (const id of ['home-week','result-week']) {
    $(id).replaceChildren(...getWeekDates(today).map(date => {
      const day = document.createElement('div');
      const value = new Date(`${date}T12:00:00Z`);
      const isAvailable = date <= today && bank.puzzles.some(item => item.date === date);
      day.className = `week-day${completed.has(date) ? ' is-completed' : ''}${date === today ? ' is-today' : ''}${!isAvailable ? ' is-unreleased' : ''}`;
      day.setAttribute('role','img');
      day.setAttribute('aria-label',`${value.toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'})}${date === today ? ', today' : ''}${completed.has(date) ? ', completed' : !isAvailable ? ', unavailable' : ', not completed'}`);
      day.innerHTML = `<span class="week-label" aria-hidden="true">${value.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'})}</span><span class="week-tile" aria-hidden="true">${completed.has(date) ? renderIcon('check') : value.getUTCDate()}</span>`;
      return day;
    }));
  }
}

function renderScreen() {
  const solved = isSolved(puzzle,progress.board);
  updatePuzzleLinks(screen === 'home' ? null : mode === 'practice' ? 'practice' : puzzle.date,screen === 'home' ? 'home' : null);
  document.body.classList.toggle('show-home',screen === 'home');
  document.body.classList.toggle('show-result',screen === 'result');
  $('home').hidden = screen !== 'home';
  $('game').hidden = screen === 'home';
  $('home-open').hidden = screen === 'home';
  $('completion').hidden = screen !== 'result' || !solved;
  $('view-result').hidden = screen !== 'puzzle' || !solved;
  $('view-result').textContent = mode === 'daily' ? "View today's result" : 'View result';
  document.querySelector('.skip-link').href = screen === 'home' ? '#home' : screen === 'result' ? '#completion' : '#game';
}

function showScreen(next) {
  if (!puzzle) return;
  save(false);
  screen = next;
  selected = null;
  render();
  save();
  window.scrollTo({top:0,behavior:'instant'});
  (next === 'home' ? $('home-play').hidden ? $('home-result') : $('home-play') : next === 'result' ? $('share').hidden ? $('play-today') : $('share') : $('home-open')).focus({preventScroll:true});
}

$('home-open').addEventListener('click',() => showScreen('home'));
document.querySelector('.brand').addEventListener('click',event => {
  if (!puzzle || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  showScreen('home');
});
$('home-play').addEventListener('click',() => puzzle.date === today ? showScreen('puzzle') : navigateTo(`?date=${today}${testMode ? '&test=1' : ''}`));
$('home-result').addEventListener('click',() => puzzle.date === today && isSolved(puzzle,progress.board) ? showScreen('result') : navigateTo(`?date=${today}${testMode ? '&test=1' : ''}`));
$('view-solved').addEventListener('click',() => showScreen('puzzle'));
$('view-result').addEventListener('click',() => showScreen('result'));

document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog => {
  let hasOutsidePress = false;
  const isOutside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  };
  dialog.addEventListener('pointerdown',event => { hasOutsidePress = event.isPrimary && event.button === 0 && isOutside(event); });
  dialog.addEventListener('pointercancel',() => { hasOutsidePress = false; });
  dialog.addEventListener('click',event => {
    if (hasOutsidePress && isOutside(event)) dialog.close();
    hasOutsidePress = false;
  });
});
document.addEventListener('pointerdown', () => document.documentElement.classList.add('pointer-input'), true);
document.addEventListener('keydown', event => {
  const isEditingText = event.target.isContentEditable || event.target.matches('textarea,input:not([type="checkbox"]):not([type="radio"])');
  if (['Tab', 'Escape'].includes(event.key) || (!isEditingText && ['Enter', ' ', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))) {
    document.documentElement.classList.remove('pointer-input');
  }
  if (event.key === 'Escape' && selected && !document.querySelector('dialog[open]')) { selected = null; render(); }
  if (['Delete', 'Backspace'].includes(event.key) && !isEditingText && !event.metaKey && !event.ctrlKey && !event.altKey && event.target.closest('#board,#tray,dialog')) {
    event.preventDefault();
    if (screen !== 'puzzle' || !selected || drag || document.querySelector('dialog[open]') || event.target.closest('[aria-disabled="true"]')) return;
    if (!progress.board.includes(selected) || progress.hintedPlaces.includes(selected)) return;
    const id = selected;
    const index = progress.board.indexOf(id);
    if (applyBoard(movePlace(progress.board,id,null),`${nameOf(id)} is back in the tray.`,'remove')) {
      $('board').children[index].focus({preventScroll:true});
    }
  }
});

async function postRecord(collection, record, key) {
  const response = await fetch(`./.herenow/data/${collection}`, {
    method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':key},
    body:JSON.stringify(record), signal:AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'Too many notes were sent recently. Please try again in an hour.' : 'The note could not be sent. Your text is still here, so you can try again.');
}

function track(event, properties = {}) {
  const currentMode = mode === 'practice' ? mode : puzzle?.date === puzzleDay() ? 'daily' : 'archive';
  analytics.track(event,{moves:progress?.moves || 0,hints:progress?.hints || 0,puzzle_mode:currentMode,...properties});
}

function startPlay(action) {
  if (started || !['place','hint'].includes(action)) return;
  started = true;
  track('puzzle_start',{action,elapsed_active_ms:analytics.activeMilliseconds()});
}

async function save(shouldRun = !document.hidden) {
  solveTimer = advanceSolveTimer(solveTimer,performance.now(),progress.board.some(Boolean),shouldRun && screen === 'puzzle' && !isSolved(puzzle,progress.board));
  progress.elapsedMs = solveTimer.elapsedMs;
  progress.reported ||= restoreProgress(read(`${progressPrefix}${puzzle.date}`),ids,puzzle.solution).reported;
  streakDays = [...new Set([...restoreStreakDays(read(streakKey)),...streakDays])].sort();
  try {
    const writes = [saveValue(`${progressPrefix}${puzzle.date}`, JSON.stringify(progress))];
    if (streakDays.length) writes.push(saveValue(streakKey, JSON.stringify(streakDays)));
    await Promise.all(writes);
    $('save-warning').hidden = !native || Boolean(native.storage);
    return true;
  } catch {
    $('save-warning').hidden = false;
    return false;
  }
}

function celebrateSolve() {
  document.querySelector('.confetti')?.remove();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const burst = document.createElement('div');
  burst.className = 'confetti';
  burst.setAttribute('aria-hidden','true');
  document.body.append(burst);
  const colors = ['#37634f','#e8bc3a','#85ad77','#cb7b64','#879bb9'];
  for (let index = 0; index < 48; index++) {
    const piece = document.createElement('i'), fromLeft = index % 2 === 0;
    piece.style.background = colors[index % colors.length];
    burst.append(piece);
    const startX = fromLeft ? -10 : innerWidth + 10;
    const endX = innerWidth * (.1 + Math.random() * .8);
    const rotation = (Math.random() - .5) * 1000;
    piece.animate([
      {transform:`translate(${startX}px,${innerHeight * .6}px) rotate(0deg)`,opacity:1},
      {transform:`translate(${endX}px,${innerHeight * (.05 + Math.random() * .25)}px) rotate(${rotation * .4}deg)`,opacity:1,offset:.4},
      {transform:`translate(${endX + (fromLeft ? 60 : -60)}px,${innerHeight + 30}px) rotate(${rotation}deg)`,opacity:0}
    ],{duration:1600 + Math.random() * 600,easing:'ease-out',fill:'forwards'});
  }
  setTimeout(() => burst.remove(),2300);
}

function applyBoard(board, message, action = 'place') {
  const shouldClearHints = action === 'reset' && isSolved(puzzle,progress.board);
  if (!shouldClearHints && progress.hintedPlaces.some(id => board[puzzle.solution.indexOf(id)] !== id)) return false;
  const hasChanged = board.some((id,index) => id !== progress.board[index]);
  if (!hasChanged && action !== 'reset') return false;
  if (hasChanged) {
    const previous = {board:[...progress.board],moves:progress.moves};
    if (action === 'reset') {
      save(false);
      previous.elapsedMs = progress.elapsedMs;
      if (shouldClearHints) {
        previous.hints = progress.hints;
        previous.hintedPlaces = [...progress.hintedPlaces];
      }
    }
    history.push(previous);
    if (history.length > 100) history.shift();
    progress.moves++;
  }
  if (action === 'reset') solveTimer = {elapsedMs:0,startedAt:null};
  if (shouldClearHints) { progress.hints = 0; progress.hintedPlaces = []; }
  progress.board = board;
  screen = 'puzzle';
  shouldShowGuidance = false;
  selected = null;
  startPlay(action);
  track(action === 'reset' ? 'board_reset' : 'board_move',{action});
  save();
  render();
  if (message && !wasSolved) {
    $('selection-status').textContent = message;
  }
  return hasChanged;
}

function chooseLot(index) {
  if (progress.hintedPlaces.includes(progress.board[index])) return;
  if (!selected) {
    selected = progress.board[index];
    render();
    return;
  }
  if (progress.board[index] === selected) { selected = null; render(); return; }
  const chosen = selected;
  applyBoard(movePlace(progress.board, chosen, index), `${nameOf(chosen)} moved to ${'ABC'[Math.floor(index / 3)]}${index % 3 + 1}.`);
}

let drag = null, suppressDragClick = false;

function dropTarget(x, y) {
  const element = document.elementFromPoint(x,y);
  const lot = element?.closest('#board [data-lot]');
  if (lot?.classList.contains('locked')) return null;
  return lot || (progress.board.includes(drag.id) ? element?.closest('#tray') : null);
}

function paintDrag() {
  if (!drag?.active) return;
  const edge = 48;
  const scroll = drag.y < edge ? -8 : drag.y > innerHeight - edge ? 8 : 0;
  if (scroll) window.scrollBy({top:scroll,behavior:'instant'});
  drag.ghost.style.transform = `translate(${drag.x - 38}px,${drag.y - 46}px)`;
  const target = dropTarget(drag.x,drag.y);
  if (target !== drag.target) {
    drag.target?.classList.remove('drop-target');
    target?.classList.add('drop-target');
    drag.target = target;
  }
  drag.frame = requestAnimationFrame(paintDrag);
}

function finishDrag(event, cancelled = false) {
  if (!drag || (event?.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  const current = drag;
  const target = !cancelled && current.active ? dropTarget(event.clientX,event.clientY) : null;
  drag = null;
  cancelAnimationFrame(current.frame);
  current.ghost?.remove();
  current.target?.classList.remove('drop-target');
  current.source.classList.remove('drag-source');
  if (current.source.hasPointerCapture(current.pointerId)) current.source.releasePointerCapture(current.pointerId);
  if (!current.active) return;
  suppressDragClick = true;
  event?.preventDefault();
  let result = 'cancelled';
  if (target) {
    const index = target.id === 'tray' ? null : Number(target.dataset.lot);
    const board = movePlace(progress.board,current.id,index);
    const changed = applyBoard(board,index === null ? `${nameOf(current.id)} is back in the tray.` : `${nameOf(current.id)} moved to ${'ABC'[Math.floor(index / 3)]}${index % 3 + 1}.`,index === null ? 'remove' : 'place');
    result = changed ? index === null ? 'returned' : 'placed' : 'unchanged';
  }
  track('drag_result',{result,action:current.pointerType});
}

window.addEventListener('pointerdown',() => { suppressDragClick = false; },true);
window.addEventListener('click',event => {
  if (!suppressDragClick || event.detail === 0) return;
  suppressDragClick = false;
  event.preventDefault(); event.stopImmediatePropagation();
},true);
document.addEventListener('pointerdown',event => {
  if (drag) { finishDrag(null,true); return; }
  if (!event.isPrimary || event.button !== 0 || !puzzle || $('game').inert) return;
  const source = event.target.closest('#tray [data-place],#board [data-lot]');
  if (!source) return;
  const id = source.dataset.place || progress.board[Number(source.dataset.lot)];
  if (!id || progress.hintedPlaces.includes(id)) return;
  drag = {id,source,pointerId:event.pointerId,pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false};
  try { source.setPointerCapture(event.pointerId); } catch {}
});
document.addEventListener('pointermove',event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  drag.x = event.clientX; drag.y = event.clientY;
  if (!drag.active && Math.hypot(drag.x - drag.startX,drag.y - drag.startY) > 8) {
    drag.active = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-ghost'; drag.ghost.setAttribute('aria-hidden','true');
    drag.ghost.innerHTML = `${placeArt(drag.id)}<span>${nameOf(drag.id)}</span>`;
    document.body.append(drag.ghost);
    drag.source.classList.add('drag-source');
    paintDrag();
  }
  if (drag.active) event.preventDefault();
});
document.addEventListener('pointerup',event => finishDrag(event));
document.addEventListener('pointercancel',event => finishDrag(event,true));
document.addEventListener('lostpointercapture',event => finishDrag(event,true));
document.addEventListener('keydown',event => { if (event.key === 'Escape') finishDrag(null,true); });
window.addEventListener('blur',() => finishDrag(null,true));
document.addEventListener('visibilitychange',() => { if (document.hidden) finishDrag(null,true); });
$('game').addEventListener('dragstart',event => event.preventDefault());

function makeBoard() {
  $('board').replaceChildren();
  for (let index = 0; index < 9; index++) {
    const button = document.createElement('button');
    button.className = 'lot'; button.dataset.lot = index;
    button.addEventListener('click', () => chooseLot(index));
    $('board').append(button);
  }
  $('tray').replaceChildren();
  for (const place of PLACES) {
    const button = document.createElement('button');
    button.className = 'place'; button.dataset.place = place.id;
    button.innerHTML = `${placeArt(place.id)}<span class="place-name">${place.name}${renderIcon('check','placed-check')}</span>`;
    button.addEventListener('click', () => { if (progress.hintedPlaces.includes(place.id)) return; selected = selected === place.id ? null : place.id; render(); });
    $('tray').append(button);
  }
  $('clues').replaceChildren();
  for (const clue of puzzle.clues) {
    const item = document.createElement('li');
    item.dataset.teaser = String(hasGuidance && ['left:bakery:books','sameRow:bakery:park','adjacent:books:park'].includes(`${clue.type}:${clue.a}:${clue.b}`));
    item.innerHTML = '<span class="clue-icon" aria-hidden="true"></span><span class="clue-text"></span><span class="sr-only clue-state"></span>';
    const text = item.querySelector('.clue-text');
    for (const word of clueText(clue).split(/(\b[A-Z][a-z]+\b)/)) {
      const part = document.createElement(PLACES.some(place => place.name === word) ? 'strong' : 'span');
      part.textContent = word;
      text.append(part);
    }
    $('clues').append(item);
  }
}

function updateReturnPrompt() {
  if (!puzzle) return;
  const now = new Date();
  const currentDay = puzzleDay(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDay = puzzleDay(tomorrow);
  const hasToday = bank.puzzles.some(item => item.date === currentDay);
  const hasTomorrow = bank.puzzles.some(item => item.date === nextDay);
  const isToday = puzzle.date === currentDay;
  if (currentDay !== today) {
    today = currentDay;
    if (mode !== 'practice') {
      mode = isToday ? 'daily' : 'archive';
      $('board-title').textContent = isToday ? "Today's puzzle" : 'Archived puzzle';
      analytics.setContext({puzzle_date:puzzle.date,puzzle_mode:mode,puzzle_version:bank.version,has_guidance:hasGuidance});
      const number = bank.puzzles.findIndex(item => item.date === puzzle.date) + 1;
      document.title = `NookGrid | ${isToday ? 'Free daily brain game' : `Brain game ${number}`}`;
    }
    renderHistory();
    if ($('calendar-dialog').open) prepareCalendar(false);
  }
  $('new-day').hidden = currentDay === openedDay || isToday || !hasToday || mode === 'practice';
  $('play-today').hidden = mode !== 'practice' || !hasToday;
  $('play-today').href = `?date=${currentDay}${testMode ? '&test=1' : ''}`;
  $('new-day').querySelector('a').href = $('play-today').href;
  $('next-puzzle').hidden = !isToday || !hasTomorrow;
  if (isToday && hasTomorrow) $('next-puzzle-time').textContent = nextPuzzleCountdown(now);
  const streak = streakLength(streakDays,currentDay);
  $('daily-streak').textContent = `${streak}-day streak`;
  $('daily-streak').hidden = streak === 0 || !isToday;
  $('clues-title').textContent = mode === 'practice' ? 'Tutorial plan' : isToday ? 'Today’s plan' : `${$('puzzle-date').textContent} plan`;
}

window.addEventListener('storage',event => {
  if (event.key !== null && !event.key.startsWith(progressPrefix)) return;
  streakDays = restoreStreakDays(read(streakKey));
  updateReturnPrompt();
  renderHistory();
  if ($('calendar-dialog').open) prepareCalendar(false);
});

function render() {
  if (!puzzle) return;
  const board = progress.board;
  const solved = isSolved(puzzle, board);
  // ponytail: this lesson follows the fixed tutorial's first four rules; update it if that puzzle changes.
  const starterPlaces = puzzle.solution.slice(0,3);
  const nextStarterIndex = starterPlaces.findIndex((id,index) => board[index] !== id);
  const starterStep = mode !== 'practice' ? -1 : nextStarterIndex < 0 || board.some(id => id && !starterPlaces.includes(id)) ? 3 : nextStarterIndex;
  const isLearning = starterStep >= 0 && starterStep < 3;
  const shouldFocusCompletion = solved && (!wasSolved || (!selected && Boolean(document.activeElement?.closest('.play-controls'))));
  $('game').classList.toggle('has-guidance', shouldShowGuidance);
  const instruction = mode === 'practice' && selected && board.includes(selected) ? 'Tap another square to move or swap.' : mode === 'practice' && solved ? 'Your neighborhood is complete.' : starterStep >= 0 ? [
    selected === 'bakery' ? 'Tap A1 to place Bakery.' : 'Tap Bakery, then A1, the outlined square.',
    'Place Cafe in the next square to the right of Bakery.',
    'Cafe fits. Use the plan to place Books.',
    'Finish the plan. A checked square fits; a crossed square needs a change.'
  ][starterStep] : shouldShowGuidance ? 'Which column fits Park? Start with the starred items.' : 'Arrange the places to match the plan.';
  const instructionLabel = document.querySelector('.puzzle-instruction');
  if (instructionLabel.textContent !== instruction) instructionLabel.textContent = instruction;
  [...$('board').children].forEach((button,index) => {
    const id = board[index], address = `${'ABC'[Math.floor(index / 3)]}${index % 3 + 1}`;
    const isLocked = progress.hintedPlaces.includes(id);
    button.className = `lot${id ? ' occupied' : ''}${isLocked ? ' locked' : ''}${id && id === selected ? ' selected' : ''}${selected && !isLocked ? ' target' : ''}`;
    button.classList.toggle('starter-target',starterStep === 0 && index === 0);
    button.setAttribute('aria-disabled',String(isLocked));
    button.setAttribute('aria-label', `Lot ${address}, ${id ? nameOf(id) : 'empty'}${isLocked ? ', fixed by a hint' : id === selected && id ? ', selected' : ''}`);
    button.setAttribute('aria-pressed', String(Boolean(id && id === selected)));
    button.innerHTML = `<span class="address">${address}</span>${id ? `${placeArt(id)}<span class="place-name">${nameOf(id)}</span>` : ''}${isLocked ? renderIcon('lock-key','hint-lock') : ''}`;
  });
  [...$('tray').children].forEach(button => {
    const id = button.dataset.place, placed = board.includes(id), isLocked = progress.hintedPlaces.includes(id);
    button.hidden = isLearning && !starterPlaces.slice(0,starterStep + 1).includes(id) && !placed && selected !== id;
    button.className = `place${placed ? ' placed' : ''}${isLocked ? ' locked' : ''}${selected === id ? ' selected' : ''}`;
    button.querySelector('.placed-check use').setAttribute('href', `./icons.svg?v=20260924-calendar2#${isLocked ? 'lock-key' : 'check'}`);
    button.setAttribute('aria-disabled',String(isLocked));
    button.setAttribute('aria-pressed', String(selected === id));
    button.setAttribute('aria-label', `${nameOf(id)}${isLocked ? ', fixed by a hint' : placed ? ', already on the board' : ', choose a lot'}`);
  });
  [...$('clues').children].forEach((item,index) => {
    item.hidden = isLearning && (starterStep === 0 ? index > 1 : index !== starterStep + 1);
    const status = clueStatus(puzzle.clues[index],board);
    const isStartingClue = shouldShowGuidance && item.dataset.teaser === 'true';
    item.className = `clue ${status}`;
    item.querySelector('.clue-icon').innerHTML = renderIcon(isStartingClue ? 'star' : {met:'check-square',conflict:'x-square',pending:'minus'}[status]);
    item.querySelector('.clue-state').textContent = (isStartingClue ? ' Start here.' : '') + {met:' Matches the plan.',conflict:' Needs a move.',pending:' Required places are not placed yet.'}[status];
  });
  $('selection-status').classList.add('sr-only');
  $('selection-status').textContent = selected ? `${nameOf(selected)} selected. Choose a lot.` : isLearning ? `Drag ${nameOf(starterPlaces[starterStep])}, or tap it then a square.` : 'Drag a place, or tap a place then a square.';
  $('undo').disabled = !history.some(previous => restoreHintedPlaces(previous.board,progress.hintedPlaces,puzzle.solution).some((id,index) => id !== board[index]));
  $('clear').disabled = !board.some(Boolean);
  $('game').classList.toggle('is-solved', solved);
  $('game').classList.toggle('has-selection', Boolean(selected));
  $('hint').disabled = solved;
  $('hint').setAttribute('aria-label',`Hint, ${progress.hints} hint${progress.hints === 1 ? '' : 's'} used`);
  $('solved-plan').hidden = !solved;
  const plan = solved ? $('solved-plan') : $('clue-list');
  if ($('clues').parentElement !== plan) plan.append($('clues'));
  if (!solved) document.querySelector('.confetti')?.remove();
  if (solved) {
    if (!wasSolved && screen !== 'home') screen = 'result';
    $('completion-board').innerHTML = board.map(id => `<span class="completion-place">${placeArt(id)}</span>`).join('');
    const hintNote = progress.hints ? `${progress.hints} hint${progress.hints === 1 ? '' : 's'} used.` : 'Solved without hints.';
    $('completion-detail').textContent = hintNote;
    const solveTime = formatSolveTime(progress.elapsedMs);
    $('completion-time').textContent = solveTime ? `Solved in ${solveTime}` : '';
    $('completion-time').hidden = !solveTime;
    $('selection-status').textContent = 'The neighborhood plan is complete.';
    const earnedDays = addDailyCompletion(streakDays,puzzle.date,puzzleDay());
    const hasEarnedDay = earnedDays !== streakDays;
    streakDays = earnedDays;
    const shouldReport = !progress.reported;
    if (shouldReport) { track('puzzle_complete',{active_ms_this_page:analytics.activeMilliseconds()}); progress.reported = true; }
    if (shouldReport || hasEarnedDay) save();
    renderScreen();
    if (shouldFocusCompletion && screen === 'result') {
      window.scrollTo({top:0,behavior:'instant'});
      $('completion').focus({preventScroll:true});
    }
    if (!wasSolved) celebrateSolve();
  }
  wasSolved = solved;
  renderScreen();
  updateReturnPrompt();
  renderHistory();
}

$('undo').addEventListener('click', () => {
  let previous, board;
  do {
    previous = history.pop();
    if (!previous) return;
    board = restoreHintedPlaces(previous.board,previous.hintedPlaces ?? progress.hintedPlaces,puzzle.solution);
  } while (board.every((id,index) => id === progress.board[index]));
  progress.board = board; progress.moves = previous.moves; selected = null;
  if (previous.hintedPlaces) { progress.hintedPlaces = previous.hintedPlaces; progress.hints = previous.hints; }
  if ('elapsedMs' in previous) solveTimer = {elapsedMs:previous.elapsedMs,startedAt:null};
  track('board_undo');
  save(); render();
});
$('clear').addEventListener('click', () => {
  const hintsToKeep = isSolved(puzzle,progress.board) ? [] : progress.hintedPlaces;
  applyBoard(restoreHintedPlaces(Array(9).fill(null),hintsToKeep,puzzle.solution),hintsToKeep.length ? 'Board reset. Hinted places stay fixed.' : 'Board cleared.','reset');
  ($('undo').disabled ? $('hint') : $('undo')).focus({preventScroll:true});
});
$('confirm-hint').addEventListener('click', () => {
  $('hint-dialog').close();
  const index = puzzle.solution.findIndex((id,i) => progress.board[i] !== id);
  if (index < 0) return;
  progress.hintedPlaces.push(puzzle.solution[index]);
  progress.hints++;
  track('hint_used');
  applyBoard(movePlace(progress.board,puzzle.solution[index],index),`${nameOf(puzzle.solution[index])} fixed in ${'ABC'[Math.floor(index / 3)]}${index % 3 + 1}.`,'hint');
});

$('share').addEventListener('click', async () => {
  const text = shareText(puzzle.date,progress.hints,'https://nookgrid.com/',progress.elapsedMs,streakLength(streakDays,puzzleDay()));
  $('share-status').textContent = '';
  try {
    if (native) { await native.share(text); track('share_result',{result:'shared'}); }
    else if (navigator.share) { await navigator.share({title:'NookGrid',text}); track('share_result',{result:'shared'}); }
    else { await navigator.clipboard.writeText(text); $('share-status').textContent = 'Copied.'; track('share_result',{result:'copied'}); }
  } catch (error) {
    const isCancelled = error.name === 'AbortError' || (native && error.message === 'Share canceled');
    track('share_result',{result:isCancelled ? 'cancelled' : 'failed'});
    if (!isCancelled) {
      $('share-text').value = text;
      openDialog('share-dialog', $('share'));
      $('share-text').focus();
      $('share-text').select();
    }
  }
});

$('feedback-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!config.feedbackEnabled) return;
  const data = new FormData(event.currentTarget);
  const record = {message:String(data.get('message') || '').trim(),date:puzzle.date === 'tutorial' ? 'practice' : puzzle.date};
  if (!record.message || record.message.length > 1000) {
    $('feedback-status').textContent = 'Write a note of up to 1,000 characters.';
    $('feedback-message').focus();
    return;
  }
  if (testMode) { $('feedback-status').textContent = 'Test mode: nothing was sent.'; return; }
  const payload = JSON.stringify(record);
  if (feedbackPayload !== payload) { feedbackKey = crypto.randomUUID(); feedbackPayload = payload; }
  $('feedback-send').disabled = true;
  $('feedback-status').textContent = 'Sending…';
  try {
    await postRecord('feedback',record,feedbackKey);
    track('feedback_result',{result:'success'});
    $('feedback-status').textContent = 'Thanks. Feedback received.';
    $('feedback-form').reset(); feedbackKey = null; feedbackPayload = null;
  } catch (error) { track('feedback_result',{result:'failed'}); $('feedback-status').textContent = error.name === 'TimeoutError' ? 'Sending took too long. Your note is still here. Please try again.' : error.message; }
  finally { $('feedback-send').disabled = false; }
});

async function init() {
  try {
    const [puzzlesResponse, settings] = await Promise.all([
      fetch('./puzzles.json',{signal:AbortSignal.timeout(12000)}).then(response => { if (!response.ok) throw new Error('Puzzle bank unavailable'); return response.json(); }),
      analytics.config
    ]);
    bank = puzzlesResponse;
    if (!Array.isArray(bank.puzzles) || !bank.tutorial) throw new Error('Puzzle bank invalid');
    config = {feedbackEnabled:settings.feedbackEnabled === true};
    showAppStoreLink(settings.appStoreId);
    today = puzzleDay();
    ({puzzle,mode} = selectPuzzle(bank,today,params.get('date')));
    updatePuzzleLinks(mode === 'practice' ? 'practice' : puzzle.date);
    progress = restoreProgress(read(`${progressPrefix}${puzzle.date}`),ids,puzzle.solution);
    if (native && !native.storage) $('save-warning').hidden = false;
    const solved = isSolved(puzzle,progress.board);
    screen = mode !== 'practice' && (params.get('view') === 'home' || !params.has('date') && (!progress.board.some(Boolean) || solved)) ? 'home' : solved ? 'result' : 'puzzle';
    if (params.get('view') === 'home') {
      const url = new URL(location.href);
      url.searchParams.delete('view');
      window.history.replaceState(null,'',url);
    }
    solveTimer.elapsedMs = progress.elapsedMs;
    save();
    hasGuidance = params.get('teaser') === 'park' && params.get('date') === '2026-09-11' && puzzle.date === '2026-09-11';
    shouldShowGuidance = hasGuidance && progress.moves === 0 && progress.hints === 0 && !progress.reported && !progress.board.some(Boolean);
    if (shouldShowGuidance) selected = 'park';
    analytics.setContext({puzzle_date:puzzle.date,puzzle_mode:mode,puzzle_version:bank.version,has_guidance:hasGuidance});
    track('puzzle_view');
    wasSolved = isSolved(puzzle,progress.board);
    $('feedback-unavailable').hidden = config.feedbackEnabled;
    $('feedback-form').hidden = !config.feedbackEnabled;
    const number = bank.puzzles.findIndex(item => item.date === puzzle.date) + 1;
    $('puzzle-label').textContent = mode === 'practice' ? 'Tutorial' : `Puzzle #${number}`;
    $('puzzle-date').textContent = mode === 'practice' ? '' : new Date(`${puzzle.date}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
    $('puzzle-date').hidden = mode === 'practice';
    $('puzzle-date').previousElementSibling.hidden = mode === 'practice';
    $('help-tutorial').hidden = mode === 'practice';
    if (mode === 'practice') {
      document.querySelector('.puzzle-instruction').setAttribute('role','status');
      document.querySelector('.puzzle-instruction').classList.add('sr-only');
      $('completion-title').textContent = 'Nice work!';
      $('share').hidden = true;
    }
    $('play-today').href = `?date=${today}${testMode ? '&test=1' : ''}`;
    $('board-title').textContent = {daily:"Today's puzzle",archive:'Archived puzzle',practice:'The tutorial puzzle'}[mode];
    document.title = `NookGrid | ${mode === 'daily' ? 'Free daily brain game' : mode === 'practice' ? 'Tutorial brain game' : `Brain game ${number}`}`;
    if (native) document.addEventListener('click',event => {
      const anchor = event.target.closest('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin || (url.hash && url.pathname === location.pathname && url.search === location.search)) return;
      event.preventDefault();
      navigateTo(url.href);
    });
    makeBoard(); render();
    if ($('calendar-dialog').open) prepareCalendar();
    $('game').setAttribute('aria-busy','false');
    $('game').inert = false;
    setInterval(updateReturnPrompt,1000);
    document.addEventListener('visibilitychange',updateReturnPrompt);
    document.addEventListener('visibilitychange',() => save());
    window.addEventListener('pagehide',() => save(false));
    window.addEventListener('pageshow',() => save());
    if (native) native.onStateChange(({isActive}) => { save(isActive); updateReturnPrompt(); }).catch(() => {});
  } catch {
    analytics.track('app_error',{action:'puzzle_load'});
    $('load-error').hidden = false;
    $('puzzle-date').textContent = 'Unavailable';
    $('game').hidden = true;
    $('game').setAttribute('aria-busy','false');
    $('calendar-status').textContent = 'Puzzles unavailable';
    $('calendar-navigation').hidden = true;
    $('calendar-status').hidden = false;
    $('calendar-months').hidden = true;
  } finally {
    $('load-status').hidden = true;
  }
}

init();
