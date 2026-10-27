import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  EVERY_DAY,
  TODAY_VIEW_ID,
  WEEKDAYS,
  dayMatches,
  daysFromWeekdays,
  planTodayMaterialisation,
  repeatLabel,
  shiftDay,
  weekdayBit,
  weekdayIndex,
  weekdaysFromDays,
  type TodayRoutinePlan,
  type TodaySourceItem,
} from './today';

const MONDAY = '2026-10-26';
const TUESDAY = '2026-10-27';
const SATURDAY = '2026-10-31';

test('Today sits above Mine as its own view', () => {
  const viewId: string = TODAY_VIEW_ID;
  assert.equal(viewId, 'today');
  assert.equal(viewId === 'all', false);
});

test('weekday bits match Sunday-based dates', () => {
  assert.equal(weekdayIndex(TUESDAY), 2);
  assert.equal(weekdayBit(TUESDAY), 4);
  assert.equal(weekdayBit('2026-10-25'), 1);
  assert.equal(weekdayBit(SATURDAY), 64);
  assert.equal(dayMatches(EVERY_DAY, SATURDAY), true);
  assert.equal(dayMatches(WEEKDAYS, TUESDAY), true);
  assert.equal(dayMatches(WEEKDAYS, SATURDAY), false);
  assert.equal(dayMatches(WEEKDAYS, '2026-10-25'), false);
  assert.equal(daysFromWeekdays([1, 2, 3, 4, 5]), WEEKDAYS);
  assert.deepEqual(weekdaysFromDays(WEEKDAYS), [1, 2, 3, 4, 5]);
  assert.equal(repeatLabel(EVERY_DAY), 'Every day');
  assert.equal(repeatLabel(WEEKDAYS), 'Weekdays');
  assert.equal(repeatLabel(daysFromWeekdays([1, 3])), 'Mon, Wed');
});

test('shiftDay steps across month and year boundaries', () => {
  assert.equal(shiftDay(SATURDAY, 1), '2026-11-01');
  assert.equal(shiftDay('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDay(TUESDAY, 0), TUESDAY);
});

const routines: TodayRoutinePlan[] = [
  { id: 'stretch', text: 'Stretch', taskId: null, days: EVERY_DAY, rank: 'a2', active: true },
  { id: 'office', text: null, taskId: 'task-office', days: WEEKDAYS, rank: 'a1', active: true },
  { id: 'paused', text: 'Paused', taskId: null, days: EVERY_DAY, rank: 'a0', active: false },
];

function item(partial: Partial<TodaySourceItem> & Pick<TodaySourceItem, 'id' | 'day'>): TodaySourceItem {
  return { routineId: null, checked: false, ...partial };
}

test('a new day moves unticked one-offs and adds routines that are due', () => {
  const plan = planTodayMaterialisation({
    day: TUESDAY,
    alreadyMaterialised: false,
    laterDayMaterialised: false,
    earlierItems: [
      item({ id: 'milk', day: MONDAY, routineId: null, checked: false }),
      item({ id: 'called', day: MONDAY, checked: true }),
      item({ id: 'stretch-mon', day: MONDAY, routineId: 'stretch' }),
      item({ id: 'older', day: '2026-10-20' }),
    ],
    routines,
  });
  if (!plan) throw new Error('expected a plan');
  assert.deepEqual(plan.moveIds, ['milk']);
  assert.deepEqual(
    plan.routines.map((line) => line.routineId),
    ['stretch', 'office'],
  );
  assert.equal(plan.routines.find((line) => line.routineId === 'office')?.taskId, 'task-office');
});

test('Saturday skips weekday routines and a prepared day is left alone', () => {
  const saturday = planTodayMaterialisation({
    day: SATURDAY,
    alreadyMaterialised: false,
    laterDayMaterialised: false,
    earlierItems: [item({ id: 'milk', day: TUESDAY })],
    routines,
  });
  assert.deepEqual(
    saturday?.routines.map((line) => line.routineId),
    ['stretch'],
  );
  assert.deepEqual(saturday?.moveIds, ['milk']);

  const again = planTodayMaterialisation({
    day: SATURDAY,
    alreadyMaterialised: true,
    laterDayMaterialised: false,
    earlierItems: [item({ id: 'milk', day: TUESDAY })],
    routines,
  });
  assert.equal(again, null);
});

test('reading an earlier day does not pull lines back off a later one', () => {
  const plan = planTodayMaterialisation({
    day: MONDAY,
    alreadyMaterialised: false,
    laterDayMaterialised: true,
    earlierItems: [item({ id: 'milk', day: '2026-10-20' })],
    routines,
  });
  assert.deepEqual(plan?.moveIds, []);
  assert.deepEqual(
    plan?.routines.map((line) => line.routineId),
    ['stretch', 'office'],
  );
});

test('the migration keeps Today private and prepares a day in SQL', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/0026_today.sql', import.meta.url), 'utf8');
  for (const pattern of [
    /create table public\.today_items/,
    /create table public\.today_routines/,
    /create table public\.today_days/,
    /function public\.ensure_today\(p_day date\)/,
    /user_id = \(select auth\.uid\(\)\)/,
    /enable row level security/,
    /pg_advisory_xact_lock/,
    /routine_id is null/,
    /checked_at is null/,
    /on delete set null/,
  ]) {
    assert.ok(pattern.test(sql), pattern.source);
  }
});
