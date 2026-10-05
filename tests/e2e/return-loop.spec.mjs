import {test,expect,bank,daily,today,openGame,mockNative,seedProgress,solvePuzzle,expectBoard,choose} from './fixtures.mjs';

for (const isNative of [false,true]) {
  test(`${isNative ? 'native' : 'web'} Tutorial completion continues the saved daily attempt`,async ({page}) => {
    test.setTimeout(60_000);
    if (isNative) await mockNative(page);
    const saved={board:['park',...Array(8).fill(null)],moves:3,hints:0,elapsedMs:42000};
    await seedProgress(page,saved);
    await openGame(page,'date=practice');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await solvePuzzle(page,bank.tutorial.solution);
    await expect(page.locator('#play-today')).toHaveAccessibleName("Continue today's puzzle");
    await expect(page.locator('#play-today')).toHaveAttribute('href',`?date=${today}&test=1`);
    await page.locator('#play-today').focus();
    await Promise.all([page.waitForURL(`**/?date=${today}&test=1`),page.keyboard.press('Enter')]);
    await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
    await expectBoard(page,saved.board);
    await expect(page.locator('#completion')).toBeHidden();
    await expect.poll(()=>page.evaluate(date=>JSON.parse(localStorage.getItem(`nookgrid:test:v1:${date}`)).moves,today)).toBe(3);
    await expect(page.locator('#hint')).toHaveAccessibleName('Hint, 0 hints used');
  });

  test(`${isNative ? 'native' : 'web'} Tutorial completion opens today’s saved result without replaying`,async ({page}) => {
    test.setTimeout(60_000);
    if (isNative) await mockNative(page);
    await seedProgress(page,{board:daily.solution,moves:9,hints:1,reported:true,elapsedMs:42000});
    await openGame(page,'date=practice');
    await solvePuzzle(page,bank.tutorial.solution);
    await expect(page.locator('#play-today')).toHaveAccessibleName("View today's result");
    await expect(page.locator('#play-today use')).toHaveAttribute('href',/grid-four$/);
    await choose(page.locator('#play-today'));
    await expect(page.locator('#completion')).toBeVisible();
    await expect(page.locator('#completion-detail')).toHaveText('1 hint');
    if (isNative) {
      await expect(page.locator('#board')).toBeHidden();
      await choose(page.locator('#view-solved'));
    }
    await expectBoard(page,daily.solution);
    await expect(page.locator('#board [aria-disabled="true"]')).toHaveCount(9);
  });

  test(`${isNative ? 'native' : 'web'} completed daily advertises the real local next-puzzle time`,async ({page}) => {
    if (isNative) await mockNative(page);
    await seedProgress(page,{board:daily.solution,reported:true});
    await page.goto('/?test=1');
    await expect(page.locator('#game')).toHaveAttribute('aria-busy','false');
    if (isNative) {
      await expect(page.locator('#home-return')).toHaveText('Next puzzle today at 8:00 PM');
      await choose(page.locator('#home-result'));
      await expect(page.locator('#next-puzzle-time')).toHaveText('12:00:00');
      await expect(page.locator('#next-puzzle-time')).toHaveAttribute('aria-description','Next puzzle today at 8:00 PM');
    }
    await expect(page.locator('#result-return')).toHaveText('Next puzzle today at 8:00 PM');
    if (isNative) await expect(page.locator('#result-return')).toBeHidden();
    else await expect(page.locator('#result-return')).toBeVisible();
    if (!isNative) await expect(page.locator('#next-puzzle')).toBeHidden();
    await expect(page.locator('#share')).toBeVisible();
  });
}

test('native UTC rollover replaces the completed-day return time with the new daily action',async ({page}) => {
  await mockNative(page);
  await page.clock.setFixedTime(new Date('2026-09-17T23:59:58Z'));
  await seedProgress(page,{board:daily.solution,reported:true});
  await page.goto('/?test=1');
  await expect(page.locator('#home-return')).toBeVisible();
  await choose(page.locator('#home-result'));
  await expect(page.locator('#next-puzzle-time')).toHaveAttribute('aria-description','Next puzzle today at 8:00 PM');
  await page.clock.setFixedTime(new Date('2026-09-18T00:00:01Z'));
  await page.clock.fastForward(1000);
  await expect(page.locator('#result-return')).toBeHidden();
  await expect(page.locator('#next-puzzle')).toBeHidden();
  await choose(page.locator('#home-open'));
  await expect(page.locator('#home-return')).toBeHidden();
  await expect(page.locator('#home-play')).toHaveAccessibleName("Play today's puzzle");
  await choose(page.locator('#home-play'));
  await expect(page.locator('#clues-title')).toHaveText('Fri, Sep 18, 2026');
  await expectBoard(page,Array(9).fill(null));
});
