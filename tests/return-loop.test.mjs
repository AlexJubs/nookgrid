import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextPuzzleAvailability,dailyContinuation} from '../public/return-loop.mjs';

test('UTC midnight schedule presents the correct local calendar day and time',() => {
  const dates=['2026-09-18'];
  const now='2026-09-17T12:00:00Z';
  assert.deepEqual(nextPuzzleAvailability(now,dates,{timeZone:'Pacific/Honolulu'}),{
    date:'2026-09-18',at:'2026-09-18T00:00:00.000Z',label:'Next puzzle today at 2:00 PM'
  });
  assert.equal(nextPuzzleAvailability(now,dates,{timeZone:'Europe/London'}).label,'Next puzzle tomorrow at 1:00 AM');
  assert.equal(nextPuzzleAvailability('2026-11-01T12:00:00Z',['2026-11-02'],{timeZone:'America/New_York'}).label,'Next puzzle today at 7:00 PM');
});

test('next-puzzle availability advances on UTC rollover and never advertises an absent puzzle',() => {
  assert.equal(nextPuzzleAvailability('2026-09-17T23:59:59Z',['2026-09-18'],{timeZone:'UTC'}).date,'2026-09-18');
  assert.equal(nextPuzzleAvailability('2026-09-18T00:00:00Z',['2026-09-18'],{timeZone:'UTC'}),null);
  assert.equal(nextPuzzleAvailability('invalid',['2026-09-18']),null);
});

test('Tutorial completion uses today’s actual continuation state',() => {
  assert.deepEqual(dailyContinuation({available:true,hasAttempt:false,solved:false}),{state:'fresh',label:"Play today's puzzle",icon:'play-circle'});
  assert.deepEqual(dailyContinuation({available:true,hasAttempt:true,solved:false}),{state:'resumed',label:"Continue today's puzzle",icon:'play-circle'});
  assert.deepEqual(dailyContinuation({available:true,hasAttempt:true,solved:true}),{state:'replay',label:"View today's result",icon:'grid-four'});
  assert.equal(dailyContinuation({available:false}),null);
});
