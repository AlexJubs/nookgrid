import { test, expect, bank, daily, emptyBoard, today, openGame, enterGame, choose, place, expectBoard, solvePuzzle, readProgress, seedProgress, dragPlace } from './fixtures.mjs';

test('Tutorial ignores a legacy saved completion and starts fresh', async ({ page }) => {
  await seedProgress(page, { board: bank.tutorial.solution, hints: 9, hintedPlaces: bank.tutorial.solution, reported: true, elapsedMs: 62_000 }, bank.tutorial.date);
  await openGame(page, 'date=practice');
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#completion')).toBeHidden();
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#board .locked')).toHaveCount(0);
  await expect(page.locator('#tray .place:visible')).toHaveCount(1);
});

test('Tutorial completion lasts for the current visit and Play tutorial starts a new attempt', async ({ page }) => {
  await seedProgress(page, { board: ['park', ...Array(8).fill(null)], moves: 1 }, today);
  await seedProgress(page, ['2026-09-16'], 'streak');
  await openGame(page, 'date=practice');
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await page.clock.fastForward(65_000);
  await solvePuzzle(page, bank.tutorial.solution, 1);
  await expect(page.locator('#completion-detail')).toHaveText('1 hint used.');
  await choose(page.locator('#view-solved'));
  await expectBoard(page, bank.tutorial.solution);
  await page.locator('#help-open').click();
  await expect(page.locator('#help-tutorial')).toBeHidden();
  await page.locator('#help-dialog [data-close]').click();
  await page.locator('#view-result').click();
  await expect(page.locator('#completion')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  await expect(page.locator('#completion')).toBeVisible();
  expect(await readProgress(page, bank.tutorial.date)).toBeNull();
  expect(await readProgress(page, 'streak')).toEqual(['2026-09-16']);
  await page.locator('#result-calendar-open').click();
  await expect(page.locator('#calendar-dialog .is-completed')).toHaveCount(0);
  await expect(page.locator('#calendar-dialog a[data-puzzle-date="practice"]')).toHaveCount(0);
  await page.locator('#calendar-dialog [data-close]').click();
  await page.locator('#home-open').click();
  await page.locator('#help-open').click();
  await page.locator('#help-tutorial').click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#completion')).toBeHidden();
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#tray .place:visible')).toHaveCount(1);
  await openGame(page);
  await expectBoard(page, ['park', ...Array(8).fill(null)]);
  expect(await readProgress(page, 'streak')).toEqual(['2026-09-16']);
});

test('restoring a cached Tutorial visit restarts practice without affecting ordinary page show', async ({ page }) => {
  await openGame(page, 'date=practice');
  await place(page, 'bakery', 0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await Promise.all([
    page.waitForEvent('load'),
    page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  ]);
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#tray .place:visible')).toHaveCount(1);
  await page.locator('#home-open').click();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#home')).toBeVisible();
  await page.locator('#help-open').click();
  await expect(page.locator('#help-tutorial')).toBeVisible();
});

test('tutorial guides all three moves, unlocks the full plan and completes', async ({ page }) => {
  await openGame(page, 'date=practice');
  await expect(page.locator('#puzzle-label')).toHaveText('Tutorial');
  await expect(page.locator('#tutorial-intro')).toHaveCount(0);
  await expect(page.locator('.puzzle-instruction')).toHaveClass(/sr-only/);
  expect(await page.locator('.puzzle-instruction').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
  await expect(page.locator('#puzzle-date')).toBeHidden();
  await expect(page.locator('#board [data-lot="0"]')).toHaveClass(/starter-target/);
  await expect(page.locator('#tray .place:visible')).toHaveCount(1);
  await expect(page.locator('#clues .clue:visible')).toHaveCount(2);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Tap Bakery, then A1, the outlined square.');
  await choose(page.locator('#tray [data-place="bakery"]'));
  await expect(page.locator('.puzzle-instruction')).toHaveText('Tap A1 to place Bakery.');
  await choose(page.locator('#board [data-lot="0"]'));
  await expect(page.locator('.puzzle-instruction')).toHaveText('Place Cafe in the next square to the right of Bakery.');
  await expect(page.locator('#tray .place:visible')).toHaveCount(2);
  await expect(page.locator('#clues .clue:visible')).toHaveCount(1);
  await place(page, 'cafe', 1);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Cafe fits. Use the plan to place Books.');
  await expect(page.locator('#tray .place:visible')).toHaveCount(3);
  await place(page, 'books', 2);
  await expect(page.locator('#tutorial-intro')).toHaveCount(0);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Finish the plan. A checked square fits; a crossed square needs a change.');
  await expect(page.locator('#tray .place:visible')).toHaveCount(9);
  await expect(page.locator('#clues .clue:visible')).toHaveCount(bank.tutorial.clues.length);
  await solvePuzzle(page, bank.tutorial.solution, 3);
  await expectBoard(page, bank.tutorial.solution);
  await expect(page.locator('#completion-title')).toHaveText('Nice work!');
  await expect(page.locator('#share')).toBeHidden();
  await expect(page.locator('#play-today')).toBeVisible();
  await expect(page.locator('#completion')).toBeFocused();
  await page.locator('#play-today').click();
  await expect(page.locator('#puzzle-date')).toHaveText('Sep 17, 2026');
  await expectBoard(page, emptyBoard);
});

test('Tutorial wrong moves and undo keep guidance aligned with the current board', async ({ page }) => {
  await openGame(page, 'date=practice');
  await place(page, 'bakery', 1);
  await expectBoard(page, [null, 'bakery', ...Array(7).fill(null)]);
  await expect(page.locator('#tray .place:visible')).toHaveCount(1);
  await expect(page.locator('#clues .conflict:visible')).not.toHaveCount(0);
  await choose(page.locator('#board [data-lot="1"]'));
  await expect(page.locator('.puzzle-instruction')).toHaveText('Tap another square to move or swap.');
  await choose(page.locator('#board [data-lot="0"]'));
  await expect(page.locator('.puzzle-instruction')).toHaveText('Place Cafe in the next square to the right of Bakery.');
  await place(page, 'cafe', 2);
  await expectBoard(page, ['bakery', null, 'cafe', ...Array(6).fill(null)]);
  await expect(page.locator('#tray .place:visible')).toHaveCount(2);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Place Cafe in the next square to the right of Bakery.');
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await place(page, 'cafe', 1);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Cafe fits. Use the plan to place Books.');
  await page.locator('#undo').click();
  await expect(page.locator('.puzzle-instruction')).toHaveText('Place Cafe in the next square to the right of Bakery.');
  await expect(page.locator('#tray .place:visible')).toHaveCount(2);
  await place(page, 'cafe', 1);
  await place(page, 'books', 2);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Finish the plan. A checked square fits; a crossed square needs a change.');
  await choose(page.locator('#board [data-lot="1"]'));
  await expect(page.locator('.puzzle-instruction')).toHaveText('Tap another square to move or swap.');
  await expect(page.getByRole('button', { name: 'Put back', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.puzzle-instruction')).toHaveText('Finish the plan. A checked square fits; a crossed square needs a change.');
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', 'cafe', ...Array(7).fill(null)]);
  await expect(page.locator('.puzzle-instruction')).toHaveText('Cafe fits. Use the plan to place Books.');
  await expect(page.locator('#tray .place:visible')).toHaveCount(3);
});

test('Tutorial hint and selection messages remain screen-reader-only on phone and wide layouts', async ({ page }) => {
  for (const viewport of [{ width: 375, height: 667 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    await openGame(page, 'date=practice');
    const previousHints = (await readProgress(page, bank.tutorial.date))?.hints || 0;
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
    await expect(page.locator('#hint')).toHaveAccessibleName(new RegExp(`^Hint, ${previousHints + 1} hints? used$`));
    await expect(page.locator('#selection-status')).toHaveClass(/sr-only/);
    expect(await page.locator('#selection-status').evaluate(element => element.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
    await choose(page.locator('#tray .place[aria-disabled="false"]:visible').last());
    await expect(page.locator('#selection-status')).toHaveClass(/sr-only/);
    await expect(page.locator('#selection-status')).toContainText('selected. Choose a lot.');
    await expect(page.locator('#tray [aria-pressed="true"]')).toHaveCount(1);
  }
});

test('tap controls select, deselect, swap, undo and reset', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#undo')).toBeDisabled();
  await expect(page.locator('#clear')).toBeDisabled();
  await choose(page.locator('[data-place="bakery"]'));
  await expect(page.locator('[data-place="bakery"]')).toHaveAttribute('aria-pressed', 'true');
  await choose(page.locator('[data-place="bakery"]'));
  await expect(page.locator('[data-place="bakery"]')).toHaveAttribute('aria-pressed', 'false');
  await choose(page.locator('[data-place="cafe"]'));
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-place="cafe"]')).toHaveAttribute('aria-pressed', 'false');
  await place(page, 'bakery', 0);
  await place(page, 'cafe', 1);
  await choose(page.locator('[data-lot="0"]'));
  await choose(page.locator('[data-lot="1"]'));
  const swapped = ['cafe', 'bakery', ...Array(7).fill(null)];
  await expectBoard(page, swapped);
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', 'cafe', ...Array(7).fill(null)]);
  await choose(page.locator('[data-lot="0"]'));
  await choose(page.locator('[data-lot="1"]'));
  await expectBoard(page, swapped);
  await page.locator('#clear').click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#undo')).toBeFocused();
  await page.locator('#undo').click();
  await expectBoard(page, swapped);
  await page.reload();
  await expectBoard(page, swapped);
  await expect(page.locator('#undo')).toBeDisabled();
});

for (const date of [today, 'practice', bank.puzzles[0].date]) {
  test(`keyboard returns a selected place to the tray with Undo for ${date}`, async ({ page }) => {
    await openGame(page, `date=${date}`);
    const saveDate = date === 'practice' ? bank.tutorial.date : date;
    const board = ['bakery', ...Array(8).fill(null)];
    await place(page, 'bakery', 0);
    await page.locator('[data-lot="0"]').press('Enter');
    await expect(page.locator('[data-lot="0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Delete');
    await expectBoard(page, emptyBoard);
    await expect(page.locator('#selection-status')).toHaveText('Bakery is back in the tray.');
    if (date === 'practice') expect(await readProgress(page, saveDate)).toBeNull();
    else expect((await readProgress(page, saveDate)).board).toEqual(emptyBoard);
    await page.locator('#undo').press('Enter');
    await expectBoard(page, board);
    await page.reload();
    await expectBoard(page, date === 'practice' ? emptyBoard : board);
    if (date === 'practice') await place(page, 'bakery', 0);
    await page.locator('[data-place="bakery"]').press('Enter');
    await page.keyboard.press('Backspace');
    await expectBoard(page, emptyBoard);
    await page.reload();
    await enterGame(page);
    await expectBoard(page, emptyBoard);
    if (date === 'practice') expect(await readProgress(page, saveDate)).toBeNull();
    else expect((await readProgress(page, saveDate)).board).toEqual(emptyBoard);
    await expect(page.getByRole('button', { name: 'Put back', exact: true })).toHaveCount(0);
  });
}

test('closing a dialog preserves the next focused puzzle control', async ({ page }) => {
  await openGame(page);
  for (const opener of ['help-open', 'feedback-open']) {
    await place(page, 'bakery', 0);
    await page.locator('[data-lot="0"]').press('Enter');
    if (opener === 'feedback-open') await page.locator('#menu-open').click();
    await page.locator(`#${opener}`).click();
    await page.evaluate(() => new Promise(resolve => {
      const dialog = document.querySelector('dialog[open]');
      dialog.addEventListener('close', resolve, { once: true });
      dialog.close();
      document.querySelector('[data-lot="0"]').focus();
    }));
    await expect(page.locator('[data-lot="0"]')).toBeFocused();
    await page.keyboard.press('Delete');
    await expectBoard(page, emptyBoard);
  }
});

test('removal keys preserve fixed hints and leave dialogs and text editing alone', async ({ page }) => {
  await openGame(page);
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  const fixed = [daily.solution[0], ...Array(8).fill(null)];
  await page.locator('[data-lot="0"]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  await expectBoard(page, fixed);
  await page.locator(`[data-place="${daily.solution[0]}"]`).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await expectBoard(page, fixed);
  await place(page, daily.solution[1], 1);
  await page.locator('[data-lot="1"]').press('Enter');
  const board = [...daily.solution.slice(0, 2), ...Array(7).fill(null)];
  await page.locator('[data-lot="0"]').focus();
  await page.keyboard.press('Delete');
  await expectBoard(page, board);
  await page.locator('[data-lot="1"]').focus();
  await page.locator('#help-open').click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expectBoard(page, board);
  await page.getByRole('button', { name: 'Close how to play', exact: true }).click();
  await page.locator('#menu-open').click();
  await page.locator('#feedback-open').click();
  await page.locator('#feedback-message').fill('note');
  await page.locator('#feedback-message').press('End');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#feedback-message')).toHaveValue('not');
  for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowLeft');
  expect(await page.locator('#feedback-message').evaluate(input => input.selectionStart)).toBe(0);
  await page.keyboard.press('Delete');
  await expect(page.locator('#feedback-message')).toHaveValue('ot');
  await expectBoard(page, board);
  await page.getByRole('button', { name: 'Close feedback', exact: true }).click();
  await page.locator('[data-lot="1"]').focus();
  await page.keyboard.press('Delete');
  await expectBoard(page, fixed);
});

test('keyboard removal keeps focus when Tutorial guidance hides the removed tray place', async ({ page }) => {
  await openGame(page, 'date=practice');
  await place(page, 'bakery', 0);
  await place(page, 'cafe', 1);
  await place(page, 'books', 2);
  await place(page, 'market', 8);
  await page.locator('[data-lot="0"]').press('Enter');
  await page.keyboard.press('Delete');
  await page.locator('[data-place="market"]').press('Enter');
  await page.keyboard.press('Delete');
  await expectBoard(page, [null, 'cafe', 'books', ...Array(6).fill(null)]);
  await expect(page.locator('[data-place="market"]')).toBeHidden();
  await expect(page.locator('[data-lot="8"]')).toBeFocused();
});

test('drag controls place, displace, swap and return pieces to the tray', async ({ page }) => {
  await openGame(page);
  const lot = index => page.locator(`[data-lot="${index}"]`);
  await dragPlace(page, page.locator('[data-place="bakery"]'), lot(0));
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await dragPlace(page, page.locator('[data-place="cafe"]'), lot(0));
  await expectBoard(page, ['cafe', ...Array(8).fill(null)]);
  await dragPlace(page, page.locator('[data-place="bakery"]'), lot(1));
  await dragPlace(page, lot(0), lot(1));
  await expectBoard(page, ['bakery', 'cafe', ...Array(7).fill(null)]);
  await dragPlace(page, lot(1), page.locator('#tray'));
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await expect(page.locator('[data-place="cafe"]')).toHaveAccessibleName('Cafe, choose a lot');
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', 'cafe', ...Array(7).fill(null)]);
  await dragPlace(page, lot(1), page.locator('[data-place="cafe"]'));
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  expect((await readProgress(page)).board).toEqual(['bakery', ...Array(8).fill(null)]);
  await page.reload();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await place(page, 'books', 2);
  await expectBoard(page, ['bakery', null, 'books', ...Array(6).fill(null)]);
  await page.locator('#undo').click();
  await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
  await expect(page.getByRole('button', { name: 'Put back', exact: true })).toHaveCount(0);
});

test('invalid drops and Escape cancel drags without swallowing the next tap', async ({ page }) => {
  await openGame(page);
  await dragPlace(page, page.locator('[data-place="bakery"]'), page.locator('[data-place="cafe"]'));
  await expectBoard(page, emptyBoard);
  await dragPlace(page, page.locator('[data-place="bakery"]'), null);
  await expectBoard(page, emptyBoard);
  await dragPlace(page, page.locator('[data-place="bakery"]'), page.locator('[data-lot="0"]'), true);
  await expectBoard(page, emptyBoard);
  await place(page, 'cafe', 2);
  await expectBoard(page, [null, null, 'cafe', ...Array(6).fill(null)]);
  expect((await readProgress(page)).moves).toBe(1);
});

for (const date of ['practice', bank.puzzles[0].date]) {
  test(`tray return preserves Undo for ${date}`, async ({ page }) => {
    await openGame(page, `date=${date}`);
    await place(page, 'bakery', 0);
    await dragPlace(page, page.locator('[data-lot="0"]'), page.locator('[data-place="bakery"]'));
    await expectBoard(page, emptyBoard);
    if (date === 'practice') expect(await readProgress(page, bank.tutorial.date)).toBeNull();
    else expect((await readProgress(page, date)).board).toEqual(emptyBoard);
    if (date === 'practice') {
      await expect(page.locator('#tray .place:visible')).toHaveCount(1);
      await expect(page.locator('.puzzle-instruction')).toHaveText('Tap Bakery, then A1, the outlined square.');
    }
    await page.locator('#undo').click();
    await expectBoard(page, ['bakery', ...Array(8).fill(null)]);
    await page.reload();
    await expectBoard(page, date === 'practice' ? emptyBoard : ['bakery', ...Array(8).fill(null)]);
  });
}

test('hints require confirmation and stay fixed through moves, undo, reset and reload', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#hint')).toHaveText('Hint');
  await page.locator('#hint').click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
  await place(page, daily.solution[1], 1);
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await expect(page.locator('[data-lot="0"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('[data-lot="0"]')).toHaveAccessibleName(/fixed by a hint/);
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 1 hint used');
  await expect(page.locator('#hint')).toHaveText('Hint');
  const fixed = page.locator(`#tray [data-place="${daily.solution[0]}"]`);
  const movable = page.locator(`#tray [data-place="${daily.solution[1]}"]`);
  await expect(fixed).toHaveAttribute('aria-disabled', 'true');
  await expect(fixed.locator('.place-name use')).toHaveAttribute('href', /^\.\/icons\.svg(?:\?[^#]*)?#lock-key$/);
  await expect(movable).toHaveAttribute('aria-disabled', 'false');
  await expect(movable.locator('.place-name use')).toHaveAttribute('href', /^\.\/icons\.svg(?:\?[^#]*)?#check$/);
  await expect(fixed.locator('.place-name svg')).toBeVisible();
  await expect(movable.locator('.place-name svg')).toBeVisible();
  await choose(page.locator(`[data-place="${daily.solution[2]}"]`));
  await page.locator('[data-lot="0"]').click({ force: true });
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await page.keyboard.press('Escape');
  await dragPlace(page, page.locator(`[data-place="${daily.solution[2]}"]`), page.locator('[data-lot="0"]'));
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await dragPlace(page, page.locator('[data-lot="0"]'), fixed);
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await page.locator('#clear').click();
  await expectBoard(page, [daily.solution[0], ...Array(8).fill(null)]);
  await page.locator('#undo').click();
  await expectBoard(page, [...daily.solution.slice(0, 2), ...Array(7).fill(null)]);
  await page.reload();
  await expect(page.locator('[data-lot="0"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 1 hint used');
  await expect(page.locator('#undo')).toBeDisabled();
  expect((await readProgress(page)).hintedPlaces).toEqual([daily.solution[0]]);
});

test('reset clears solved hints, Undo restores them and unfinished replay hints stay fixed', async ({ page }) => {
  await openGame(page);
  for (let count = 1; count <= 9; count++) {
    await page.locator('#hint').click();
    await page.locator('#confirm-hint').click();
    await expect(page.locator('#hint')).toHaveAttribute('aria-label', new RegExp(`^Hint, ${count} hints? used$`));
  }
  await expectBoard(page, daily.solution);
  await expect(page.locator('#completion-detail')).toHaveText('9 hints used.');
  await choose(page.locator('#view-solved'));
  await expect(page.locator('#clear')).toBeVisible();
  await expect(page.locator('#clear')).toBeEnabled();
  await expect(page.locator('#hint')).toBeDisabled();
  await expect(page.locator('#board .locked')).toHaveCount(9);
  await page.locator('#clear').click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#board .locked')).toHaveCount(0);
  expect(await readProgress(page)).toMatchObject({ hints: 0, hintedPlaces: [], reported: true, elapsedMs: 0 });
  await page.locator('#undo').click();
  await expectBoard(page, daily.solution);
  await expect(page.locator('#board .locked')).toHaveCount(9);
  await expect(page.locator('#completion-detail')).toHaveText('9 hints used.');
  await choose(page.locator('#view-solved'));
  await page.locator('#clear').click();
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await page.locator('#undo').click();
  await expectBoard(page, daily.solution);
  await expect(page.locator('#board .locked')).toHaveCount(9);
  await expect(page.locator('#completion-detail')).toHaveText('9 hints used.');
  await choose(page.locator('#view-solved'));
  await page.locator('#clear').click();
  await page.reload();
  await enterGame(page);
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
  await page.locator('#hint').click();
  await page.locator('#confirm-hint').click();
  await page.locator('#clear').click();
  await page.reload();
  await expectBoard(page, [daily.solution[0], ...Array(8).fill(null)]);
  await expect(page.locator('#board .locked')).toHaveCount(1);
  expect(await readProgress(page)).toMatchObject({ hints: 1, hintedPlaces: [daily.solution[0]], reported: true });
});

for (const puzzle of [bank.tutorial, bank.puzzles.find(item => item.date === '2026-09-16')]) {
  test(`reset starts a hint-free replay after completing ${puzzle.date}`, async ({ page }) => {
    if (puzzle.date !== 'tutorial') await seedProgress(page, { board: [...puzzle.solution.slice(0, 8), null], hints: 1, hintedPlaces: [puzzle.solution[0]], elapsedMs: 62_000 }, puzzle.date);
    await openGame(page, `date=${puzzle.date === 'tutorial' ? 'practice' : puzzle.date}`);
    if (puzzle.date === 'tutorial') {
      await page.locator('#hint').click();
      await page.locator('#confirm-hint').click();
      await solvePuzzle(page, puzzle.solution, 1);
    } else await place(page, puzzle.solution[8], 8);
    await expect(page.locator('#completion')).toBeVisible();
    await choose(page.locator('#view-solved'));
    await page.locator('#clear').click();
    await expectBoard(page, emptyBoard);
    await page.reload();
    await expectBoard(page, emptyBoard);
    await expect(page.locator('#board .locked')).toHaveCount(0);
    if (puzzle.date === 'tutorial') expect(await readProgress(page, puzzle.date)).toBeNull();
    else expect(await readProgress(page, puzzle.date)).toMatchObject({ hints: 0, hintedPlaces: [], reported: true, elapsedMs: 0 });
  });
}

test('a full incorrect board remains playable and a correct board completes', async ({ page }) => {
  await openGame(page);
  await expect(page.locator('#clues .pending .clue-icon use').first()).toHaveAttribute('href', /#minus$/);
  expect(await page.locator('#clues .pending .clue-icon').first().evaluate(icon => getComputedStyle(icon).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const wrong = [...daily.solution.slice(1), daily.solution[0]];
  for (let index = 0; index < 9; index++) await place(page, wrong[index], index);
  await expect(page.locator('#completion')).toBeHidden();
  expect(await page.locator('#clues .conflict').count()).toBeGreaterThan(0);
  await expect(page.locator('#clues .conflict .clue-state').first()).toHaveText(' Needs a move.');
  await expect(page.locator('#clues .conflict .clue-icon use').first()).toHaveAttribute('href', /#x-square$/);
  expect(await page.locator('#clues .conflict .clue-icon').first().evaluate(icon => getComputedStyle(icon).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.locator('#clear').click();
  await solvePuzzle(page);
  await expectBoard(page, daily.solution);
  await expect(page.locator('#clues .met')).toHaveCount(daily.clues.length);
  await expect(page.locator('#clues .met .clue-icon use').first()).toHaveAttribute('href', /#check-square$/);
  expect(await page.locator('#clues .clue-icon').evaluateAll(icons => icons.every(icon => getComputedStyle(icon).backgroundColor === 'rgba(0, 0, 0, 0)'))).toBe(true);
  await expect(page.locator('#completion-title')).toHaveText('Neighborhood complete');
  await expect(page.locator('#completion-detail')).toHaveText('Solved without hints.');
  await expect(page.locator('#next-puzzle')).toBeVisible();
  await expect(page.locator('#next-puzzle-time')).toHaveAttribute('aria-live', 'off');
  await expect(page.locator('.confetti')).toHaveCount(0);
  await choose(page.locator('#view-solved'));
  await page.locator('#clear').click();
  await expectBoard(page, emptyBoard);
  await expect(page.locator('#completion')).toBeHidden();
  await page.locator('#undo').click();
  await expect(page.locator('#completion')).toBeVisible();
});

test('timer starts with play, excludes hidden time and remains stopped after solving', async ({ page }) => {
  await openGame(page);
  await page.clock.fastForward(60_000);
  expect((await readProgress(page)).elapsedMs).toBe(0);
  await place(page, daily.solution[0], 0);
  expect((await readProgress(page)).elapsedMs).toBe(0);
  await page.clock.fastForward(61_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const paused = (await readProgress(page)).elapsedMs;
  expect(paused).toBeGreaterThanOrEqual(61_000);
  await page.clock.fastForward(120_000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await readProgress(page)).elapsedMs).toBe(paused);
  await solvePuzzle(page, daily.solution, 1);
  await expect(page.locator('#completion-time')).toContainText('Solved in 1:');
  const solved = (await readProgress(page)).elapsedMs;
  expect(solved - paused).toBeLessThan(10_000);
  await page.clock.fastForward(3_600_000);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await readProgress(page)).elapsedMs).toBe(solved);
  await page.reload();
  await enterGame(page);
  await expect(page.locator('#completion')).toBeVisible();
  expect((await readProgress(page)).elapsedMs).toBe(solved);
});

test('share uses the canonical daily URL and handles copy, native cancellation and fallback', async ({ page }) => {
  await seedProgress(page, ['2026-09-15', '2026-09-16'], 'streak');
  await seedProgress(page, { board: daily.solution, moves: 9, hints: 2, elapsedMs: 61_000 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedResult = text; } } });
  });
  await openGame(page, 'utm_source=playtest&utm_medium=social&utm_campaign=old&utm_content=post&utm_term=puzzle#private');
  await page.locator('#share').click();
  await expect(page.locator('#share-status')).toHaveText('Copied.');
  const result = await page.evaluate(() => window.copiedResult);
  expect(result).toContain('Solved in 1:01 with 2 hints.');
  expect(result).toContain('Your daily brain game.');
  expect(result).toContain('\n3-day streak\n');
  expect(result).toContain('\nCan you beat my time?\n');
  const link = new URL(result.split('\n').at(-1));
  expect(link.origin).toBe('https://nookgrid.com');
  expect(link.pathname).toBe('/');
  expect(Object.fromEntries(link.searchParams)).toEqual({ date: today, utm_source: 'share' });
  expect(link.hash).toBe('');
  expect(result).not.toMatch(/Bakery|Cafe|Books|Florist|Pond|Market/);
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async value => { window.nativeResult = value; } }));
  await page.locator('#share').click();
  expect(await page.evaluate(() => window.nativeResult)).toEqual({ title: 'NookGrid', text: result });
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Cancelled', 'AbortError'); } }));
  await page.locator('#share').click();
  await expect(page.locator('#share-dialog')).not.toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new Error('Unavailable'); } }));
  await page.locator('#share').click();
  await expect(page.locator('#share-text')).toHaveValue(result);
  await expect(page.locator('#share-text')).toHaveAttribute('readonly', '');
  await expect(page.locator('#share-text')).toBeFocused();
  expect(await page.locator('#share-text').evaluate(input => input.selectionEnd - input.selectionStart)).toBe(result.length);
});

test('reset restarts elapsed time and undo restores it across reload', async ({ page }) => {
  await seedProgress(page, { board: [daily.solution[0], ...Array(8).fill(null)], moves: 1, elapsedMs: 62_000 });
  await openGame(page);
  await page.clock.fastForward(1000);
  await page.locator('#clear').click();
  expect((await readProgress(page)).elapsedMs).toBe(0);
  await page.locator('#undo').click();
  const restored = (await readProgress(page)).elapsedMs;
  expect(restored).toBeGreaterThanOrEqual(63_000);
  await page.reload();
  await expectBoard(page, [daily.solution[0], ...Array(8).fill(null)]);
  expect((await readProgress(page)).elapsedMs).toBeGreaterThanOrEqual(restored);
});
