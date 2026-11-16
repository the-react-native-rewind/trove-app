import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addLine,
  buildPlan,
  cleanLine,
  daysToBitmask,
  EMPTY_LISTS,
  isEmptyPlan,
  keepChoices,
  onboardingPlanDay,
  parseHabit,
  removeLine,
  routineOnDay,
  summariseDays,
} from './onboarding';

const EVERY_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

test('cleanLine tidies spacing, the first letter and trailing punctuation', () => {
  assert.equal(cleanLine('  email   the accountant. '), 'Email the accountant');
  assert.equal(cleanLine('iPhone backup'), 'iPhone backup');
  assert.equal(cleanLine('   '), '');
  assert.equal(cleanLine('x'.repeat(120)).length, 80);
});

test('addLine ignores blanks and repeats, and removeLine takes one out', () => {
  const one = addLine([], 'fix the shed');
  assert.deepEqual(one, ['Fix the shed']);
  assert.equal(addLine(one, '   '), one);
  assert.equal(addLine(one, 'FIX THE SHED'), one);
  assert.deepEqual(addLine(one, 'book a dentist'), ['Fix the shed', 'Book a dentist']);
  assert.deepEqual(removeLine(['A', 'B'], 'A'), ['B']);
});

test('parseHabit reads no days as every day', () => {
  assert.deepEqual(parseHabit('yoga'), { text: 'Yoga', days: EVERY_DAY });
});

test('parseHabit pulls every-day words out of the text', () => {
  assert.deepEqual(parseHabit('walk the dog every day'), { text: 'Walk the dog', days: EVERY_DAY });
  assert.deepEqual(parseHabit('read daily'), { text: 'Read', days: EVERY_DAY });
  assert.deepEqual(parseHabit('stretch every morning'), {
    text: 'Stretch every morning',
    days: EVERY_DAY,
  });
});

test('parseHabit reads weekdays and weekends', () => {
  assert.deepEqual(parseHabit('run on weekdays'), {
    text: 'Run',
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  });
  assert.deepEqual(parseHabit('long walk at the weekend'), { text: 'Long walk', days: ['sat', 'sun'] });
});

test('parseHabit reads named days, short or full', () => {
  assert.deepEqual(parseHabit('yoga mon wed fri'), { text: 'Yoga', days: ['mon', 'wed', 'fri'] });
  assert.deepEqual(parseHabit('Swim on Tuesdays and Thursdays'), { text: 'Swim', days: ['tue', 'thu'] });
  assert.deepEqual(parseHabit('call mum every Sunday'), { text: 'Call mum', days: ['sun'] });
  assert.deepEqual(parseHabit('Saturday football'), { text: 'Football', days: ['sat'] });
});

test('parseHabit spreads "so many times a week" across the week', () => {
  assert.deepEqual(parseHabit('stretch 3 times a week'), { text: 'Stretch', days: ['mon', 'wed', 'fri'] });
  assert.deepEqual(parseHabit('Gym 3x a week'), { text: 'Gym', days: ['mon', 'wed', 'fri'] });
  assert.deepEqual(parseHabit('Meditate three times per week'), {
    text: 'Meditate',
    days: ['mon', 'wed', 'fri'],
  });
  assert.deepEqual(parseHabit('run twice a week'), { text: 'Run', days: ['mon', 'thu'] });
  assert.deepEqual(parseHabit('call mum once a week'), { text: 'Call mum', days: ['mon'] });
  assert.deepEqual(parseHabit('walk 7 times a week'), { text: 'Walk', days: EVERY_DAY });
  assert.deepEqual(parseHabit('Weekly review'), { text: 'Weekly review', days: ['mon'] });
});

test('parseHabit leaves a lone short day word as text', () => {
  assert.deepEqual(parseHabit('sit in the sun'), { text: 'Sit in the sun', days: EVERY_DAY });
  assert.deepEqual(parseHabit('plan the wedding'), { text: 'Plan the wedding', days: EVERY_DAY });
});

test('parseHabit keeps a line that is only a day', () => {
  assert.deepEqual(parseHabit('Mondays'), { text: 'Mondays', days: ['mon'] });
});

test('buildPlan maps each list to what it is', () => {
  const plan = buildPlan({
    habits: ['Yoga mon wed fri', 'Read'],
    work: ['Email the accountant', 'Prep the board deck'],
    home: ['Fix the shed'],
    other: ['Book a dentist'],
  });
  assert.deepEqual(
    plan.circles.map((c) => [c.source, c.name, c.actions.map((a) => a.title), c.routines.length]),
    [
      ['work', 'Work', ['Email the accountant', 'Prep the board deck'], 0],
      ['home', 'Home', ['Fix the shed'], 0],
    ],
  );
  assert.deepEqual(plan.personal.actions, [{ title: 'Book a dentist', today: false, due_date: null }]);
  assert.deepEqual(plan.personal.routines, [
    { text: 'Yoga', days: ['mon', 'wed', 'fri'] },
    { text: 'Read', days: EVERY_DAY },
  ]);
});

test('buildPlan makes no circle for an empty list', () => {
  const plan = buildPlan({ ...EMPTY_LISTS, other: ['Renew passport'] });
  assert.deepEqual(plan.circles, []);
  assert.equal(isEmptyPlan(plan), false);
  assert.equal(isEmptyPlan(buildPlan(EMPTY_LISTS)), true);
});

test('keepChoices carries review choices onto a rebuilt plan', () => {
  const lists = {
    habits: ['Yoga', 'Read'],
    work: ['Email the accountant', 'Prep the board deck'],
    home: ['Fix the shed'],
    other: [],
  };
  const reviewed = buildPlan(lists);
  reviewed.personal.routines[0].days = ['tue', 'thu'];
  reviewed.circles[0].name = 'Studio';
  reviewed.circles[0].color = 'plum';
  reviewed.circles[0].actions[1].today = true;

  const rebuilt = keepChoices(reviewed, buildPlan({ ...lists, work: [...lists.work, 'Send invoice'] }));
  assert.deepEqual(rebuilt.personal.routines[0], { text: 'Yoga', days: ['tue', 'thu'] });
  assert.deepEqual(rebuilt.personal.routines[1], { text: 'Read', days: EVERY_DAY });
  assert.equal(rebuilt.circles[0].name, 'Studio');
  assert.equal(rebuilt.circles[0].color, 'plum');
  assert.deepEqual(
    rebuilt.circles[0].actions.map((a) => [a.title, a.today]),
    [
      ['Email the accountant', false],
      ['Prep the board deck', true],
      ['Send invoice', false],
    ],
  );
  assert.equal(rebuilt.circles[1].name, 'Home');
  assert.equal(keepChoices(null, reviewed), reviewed);
});

test('onboardingPlanDay plans tomorrow from the evening', () => {
  assert.deepEqual(onboardingPlanDay(new Date(2026, 10, 16, 9, 0)), {
    day: '2026-11-16',
    isTomorrow: false,
  });
  assert.deepEqual(onboardingPlanDay(new Date(2026, 10, 16, 17, 59)), {
    day: '2026-11-16',
    isTomorrow: false,
  });
  assert.deepEqual(onboardingPlanDay(new Date(2026, 10, 16, 18, 0)), {
    day: '2026-11-17',
    isTomorrow: true,
  });
  assert.deepEqual(onboardingPlanDay(new Date(2026, 10, 30, 22, 0)), {
    day: '2026-12-01',
    isTomorrow: true,
  });
});

test('routineOnDay says whether a routine falls on a day', () => {
  // 2026-11-16 is a Monday.
  assert.equal(routineOnDay({ text: 'Yoga', days: ['mon', 'wed'] }, '2026-11-16'), true);
  assert.equal(routineOnDay({ text: 'Yoga', days: ['tue'] }, '2026-11-16'), false);
  assert.equal(routineOnDay({ text: 'Read', days: [] }, '2026-11-16'), true);
});

test('summariseDays and daysToBitmask still describe a cadence', () => {
  assert.equal(summariseDays([]), 'Every day');
  assert.equal(summariseDays(['mon', 'tue', 'wed', 'thu', 'fri']), 'Weekdays');
  assert.equal(summariseDays(['mon', 'wed']), 'Mon, Wed');
  assert.equal(daysToBitmask([]), 127);
  assert.equal(daysToBitmask(['sun', 'mon']), 3);
});
