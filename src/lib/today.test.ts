import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { compareRank, rankAtBottom } from './rank';
import {
  EVERY_DAY,
  TODAY_VIEW_ID,
  WEEKDAYS,
  dayMatches,
  daysFromWeekdays,
  planTodayMaterialisation,
  bottomTodayRank,
  canRescheduleTodayLine,
  insertTodayLine,
  openTodayLineForTask,
  momentumAppearance,
  momentumCount,
  momentumPlaybackRate,
  momentumScale,
  preferFreshTodayLines,
  previewRoutineIds,
  reconcileTodayLines,
  withLinePatch,
  repeatLabel,
  rolloverRanks,
  shiftDay,
  shouldPrepareDay,
  weekdayBit,
  weekdayIndex,
  weekdaysFromDays,
  type TodayLine,
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
  return { routineId: null, checked: false, rank: 'a0', ...partial };
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

test('a line taken off its day does not roll forward, and the task is not the plan', () => {
  const plan = planTodayMaterialisation({
    day: TUESDAY,
    alreadyMaterialised: false,
    laterDayMaterialised: false,
    earlierItems: [
      item({ id: 'milk', day: MONDAY, dismissed: true }),
      item({ id: 'call', day: MONDAY, rank: 'a1' }),
      item({ id: 'stretch-mon', day: MONDAY, routineId: 'stretch', dismissed: true }),
    ],
    routines,
  });
  assert.deepEqual(plan?.moveIds, ['call']);
  assert.equal(plan?.routines.some((line) => line.routineId === 'stretch'), true);

  const kept = line('milk', { taskId: 'task-milk', taskStatus: 'todo', checkedAt: null });
  const ticked = line('done', { checkedAt: '2026-10-27T08:00:00.000Z' });
  const preview = line('preview:stretch', { virtual: true, routineId: 'stretch' });
  assert.equal(canRescheduleTodayLine(kept), true);
  assert.equal(canRescheduleTodayLine(ticked), false);
  assert.equal(canRescheduleTodayLine(preview), false);
  assert.equal(openTodayLineForTask([ticked, kept, preview], 'task-milk')?.id, 'milk');
  assert.equal(openTodayLineForTask([ticked], 'task-milk'), null);
});

test('rolled lines keep their order and land under lines already on the day', () => {
  const plan = planTodayMaterialisation({
    day: TUESDAY,
    alreadyMaterialised: false,
    laterDayMaterialised: false,
    earlierItems: [
      item({ id: 'later', day: MONDAY, rank: 'a0' }),
      item({ id: 'first', day: MONDAY, rank: 'a2' }),
      item({ id: 'planned', day: TUESDAY, rank: 'a5' }),
      item({ id: 'done', day: MONDAY, rank: 'a3', checked: true }),
    ],
    routines,
  });
  if (!plan) throw new Error('expected a plan');
  assert.deepEqual(plan.moveIds, ['first', 'later']);
  const placed = rolloverRanks('a1', [
    { id: 'first', rank: 'a2' },
    { id: 'later', rank: 'a0' },
  ]);
  assert.deepEqual(placed.map((line) => line.id), ['first', 'later']);
  assert.equal(placed[0]?.rank, rankAtBottom('a1'));
  assert.equal(placed[1]?.rank, rankAtBottom(placed[0]?.rank ?? ''));
  assert.ok(compareRank('a1', placed[0]?.rank ?? '') < 0);
  assert.ok(compareRank(placed[0]?.rank ?? '', placed[1]?.rank ?? '') < 0);
  const kept = rolloverRanks(null, [{ id: 'first', rank: 'a2' }]);
  assert.equal(kept[0]?.rank, 'a2');
});

test('momentum counts lines ticked on that day', () => {
  const lines = [
    { day: TUESDAY, checkedAt: '2026-10-27T08:00:00.000Z' },
    { day: TUESDAY, checkedAt: '2026-10-27T18:00:00.000Z' },
    { day: TUESDAY, checkedAt: null },
    { day: TUESDAY, checkedAt: '2026-10-27T09:00:00.000Z', virtual: true },
    { day: MONDAY, checkedAt: '2026-10-26T09:00:00.000Z' },
  ];
  assert.equal(momentumCount(lines, TUESDAY), 2);
  assert.equal(momentumCount(lines, MONDAY), 1);
  assert.equal(momentumCount(lines, SATURDAY), 0);
  assert.equal(momentumCount([], TUESDAY), 0);
});

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const red = channel(parseInt(hex.slice(1, 3), 16));
    const green = channel(parseInt(hex.slice(3, 5), 16));
    const blue = channel(parseInt(hex.slice(5, 7), 16));
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const left = lum(a);
  const right = lum(b);
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

test('momentum pitch rises a semitone per tick, and unticking steps it back', () => {
  assert.equal(momentumPlaybackRate(0), 1);
  assert.equal(momentumPlaybackRate(1), 1);
  const second = 2 ** (1 / 12);
  assert.ok(Math.abs(momentumPlaybackRate(2) - second) < 1e-12);
  assert.ok(momentumPlaybackRate(3) > momentumPlaybackRate(2));
  assert.equal(momentumPlaybackRate(3), momentumPlaybackRate(4 - 1));
  assert.equal(momentumPlaybackRate(40), momentumPlaybackRate(8));
  assert.ok(momentumPlaybackRate(8) < 1.5);
});

test('momentum badge grows with the count and the number stays readable', () => {
  assert.equal(momentumScale(0), 1);
  assert.equal(momentumScale(1), 1.05);
  assert.ok(momentumScale(2) - momentumScale(1) - 0.05 < 1e-12);
  assert.equal(momentumScale(8), 1.4);
  assert.equal(momentumScale(30), momentumScale(8));

  let previousLight = '';
  let previousDark = '';
  for (let count = 0; count <= 12; count += 1) {
    for (const scheme of ['light', 'dark'] as const) {
      const appearance = momentumAppearance(count, scheme);
      assert.ok(contrast(appearance.ink, appearance.fill) >= 4.5, `${scheme} ${count}`);
    }
    const light = momentumAppearance(count, 'light').ink;
    const dark = momentumAppearance(count, 'dark').ink;
    if (count > 0 && count <= 7) {
      assert.ok(light !== previousLight);
      assert.ok(dark !== previousDark);
    }
    previousLight = light;
    previousDark = dark;
  }
  assert.ok(momentumAppearance(0, 'light').ink !== momentumAppearance(6, 'light').ink);
});

function line(id: string, patch: Partial<TodayLine> = {}): TodayLine {
  return {
    id,
    day: TUESDAY,
    text: id,
    taskId: null,
    taskTitle: null,
    taskStatus: null,
    spaceId: null,
    spaceName: null,
    spaceColor: null,
    routineId: null,
    repeatDays: null,
    routineActive: false,
    rank: id,
    checkedAt: null,
    createdAt: '2026-10-27T00:00:00.000Z',
    ...patch,
  };
}

test('a today refetch keeps row identity when only the checked timestamp changed', () => {
  const current = [line('a', { checkedAt: '2026-10-27T08:00:00.000Z', rank: 'a1' }), line('b', { rank: 'a0' })];
  const incoming = [
    line('a', { checkedAt: '2026-10-27T08:00:01.000Z', rank: 'a1' }),
    line('b', { rank: 'a0' }),
  ];
  assert.equal(reconcileTodayLines(current, incoming), current);
  const edited = withLinePatch(current, 'b', { checkedAt: '2026-10-27T09:00:00.000Z' });
  assert.equal(edited[0], current[0]);
  assert.equal(edited[1]?.checkedAt, '2026-10-27T09:00:00.000Z');
  assert.equal(withLinePatch(current, 'missing', { text: 'nope' }), current);
  const added = insertTodayLine(current, line('c', { rank: 'a2', text: 'new' }));
  assert.deepEqual(added.map((item) => item.id), ['c', 'a', 'b']);
  assert.ok(compareRank('a0', bottomTodayRank(current)) < 0);
  const stale = preferFreshTodayLines({
    startedGeneration: 1,
    currentGeneration: 2,
    startedSettled: 0,
    currentSettled: 0,
    editsInFlight: 0,
    fetched: [line('server')],
    cached: current,
  });
  assert.equal(stale, current);
  const settledDuringFetch = preferFreshTodayLines({
    startedGeneration: 2,
    currentGeneration: 2,
    startedSettled: 1,
    currentSettled: 2,
    editsInFlight: 0,
    fetched: [line('server')],
    cached: current,
  });
  assert.equal(settledDuringFetch, current);
  assert.deepEqual(
    preferFreshTodayLines({
      startedGeneration: 2,
      currentGeneration: 2,
      startedSettled: 2,
      currentSettled: 2,
      editsInFlight: 0,
      fetched: [line('server')],
      cached: current,
    }).map((item) => item.id),
    ['server'],
  );
  const stillEditing = preferFreshTodayLines({
    startedGeneration: 2,
    currentGeneration: 2,
    startedSettled: 2,
    currentSettled: 2,
    editsInFlight: 1,
    fetched: [line('server')],
    cached: current,
  });
  assert.equal(stillEditing, current);
});

test('tomorrow is not prepared, and a routine already on the day is not previewed twice', () => {
  assert.equal(shouldPrepareDay(TUESDAY, MONDAY), false);
  assert.equal(shouldPrepareDay(MONDAY, MONDAY), true);
  assert.equal(shouldPrepareDay('2026-10-25', MONDAY), true);
  assert.deepEqual(previewRoutineIds(TUESDAY, ['stretch'], routines), ['office']);
  assert.deepEqual(previewRoutineIds(SATURDAY, [], routines), ['stretch']);
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

  const followUp = readFileSync(new URL('../../supabase/migrations/0027_today_tomorrow.sql', import.meta.url), 'utf8');
  for (const pattern of [
    /p_day <= v_as_of/,
    /rank_before\(v_floor\)/,
    /on conflict \(user_id, day, routine_id\) where routine_id is not null do nothing/,
    /function public\.move_today_item_to_day/,
    /function public\.place_today_routine/,
    /Ticked lines stay on their day/,
  ]) {
    assert.ok(pattern.test(followUp), pattern.source);
  }
  assert.equal(/create policy/.test(followUp), false);

  const notToday = readFileSync(
    new URL('../../supabase/migrations/0029_today_not_today.sql', import.meta.url),
    'utf8',
  );
  assert.ok(/add column dismissed_at timestamptz/.test(notToday));
  assert.ok(/item\.dismissed_at is null/.test(notToday));
  const dismissStart = notToday.indexOf('function public.dismiss_today_item');
  const restoreStart = notToday.indexOf('function public.restore_today_item');
  assert.ok(dismissStart > 0 && restoreStart > dismissStart);
  const dismissBody = notToday.slice(dismissStart, restoreStart);
  assert.equal(/public\.tasks/.test(dismissBody), false);
  assert.equal(/today_routines/.test(dismissBody), false);
  assert.ok(/Ticked lines stay on their day/.test(dismissBody));
  assert.ok(/set dismissed_at = now\(\)/.test(dismissBody));
});
