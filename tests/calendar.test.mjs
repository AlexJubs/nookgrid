import test from 'node:test';
import assert from 'node:assert/strict';
import {getWeekDates,getCalendarMonths} from '../public/calendar.mjs';

test('the week is Monday through Sunday across month and year boundaries',() => {
  const week = ['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06'];
  for (const date of week) assert.deepEqual(getWeekDates(date),week);
  assert.deepEqual(getWeekDates('2027-01-01'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
});

test('date-only weeks do not shift with the device timezone or daylight saving',() => {
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['America/New_York','Pacific/Honolulu','Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      assert.deepEqual(getWeekDates('2026-03-08'),['2026-03-02','2026-03-03','2026-03-04','2026-03-05','2026-03-06','2026-03-07','2026-03-08']);
      assert.deepEqual(getWeekDates('2026-11-01'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
      assert.equal(getCalendarMonths('2026-08-31','2026-09-01')[0].label,'September 2026');
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test('month history starts with the current month and stops at the launch month',() => {
  const months = getCalendarMonths('2026-11-28','2027-02-03');
  assert.deepEqual(months.map(month => month.month),['2027-02','2027-01','2026-12','2026-11']);
  assert.deepEqual(months.map(month => month.label),['February 2027','January 2027','December 2026','November 2026']);
  assert.equal(months[0].days[0],'2027-02-01');
  assert.equal(months[0].days.at(-1),'2027-02-28');
  assert.deepEqual(months.at(-1).days.slice(0,7),[null,null,null,null,null,null,'2026-11-01']);
  assert.equal(months.at(-1).days.at(-1),'2026-11-30');
  assert.equal(months.reduce((count,month) => count + month.days.filter(Boolean).length,0),120);
});

test('launch and current months keep all their days so unreleased dates can remain disabled',() => {
  const [month] = getCalendarMonths('2026-09-10','2026-09-23');
  assert.equal(month.label,'September 2026');
  assert.deepEqual(month.days.slice(0,3),[null,'2026-09-01','2026-09-02']);
  assert.equal(month.days.at(-1),'2026-09-30');
  assert.equal(month.days.filter(Boolean).length,30);
});

test('leap dates and century rules produce real month lengths',() => {
  assert.equal(getCalendarMonths('2028-02-29','2028-03-01')[1].days.filter(Boolean).length,29);
  assert.equal(getCalendarMonths('2000-02-01','2000-02-29')[0].days.at(-1),'2000-02-29');
  assert.equal(getCalendarMonths('2100-02-01','2100-02-28')[0].days.at(-1),'2100-02-28');
  assert.deepEqual(getWeekDates('2028-02-29'),['2028-02-28','2028-02-29','2028-03-01','2028-03-02','2028-03-03','2028-03-04','2028-03-05']);
});

test('invalid date boundaries and a launch later than today produce no history',() => {
  for (const invalid of [null,undefined,'','tutorial','2026-9-01','2026-09-31','2026-02-29','2026-00-01','0000-01-01','2026-09-23T00:00:00Z']) {
    assert.deepEqual(getWeekDates(invalid),[]);
    assert.deepEqual(getCalendarMonths(invalid,'2026-09-23'),[]);
    assert.deepEqual(getCalendarMonths('2026-09-10',invalid),[]);
  }
  assert.deepEqual(getCalendarMonths('2026-09-24','2026-09-23'),[]);
});
