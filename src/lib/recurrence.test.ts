import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  describeRepeat,
  nextRecurrenceDate,
  repeatChoice,
  repeatScheduleCopy,
  type RepeatRule,
} from './recurrence';

function rule(partial: Partial<RepeatRule> & Pick<RepeatRule, 'unit'>): RepeatRule {
  return {
    unit: partial.unit,
    interval: partial.interval ?? 1,
    weekday: partial.weekday ?? null,
  };
}

test('next date matches the database recurrence cases', () => {
  assert.equal(nextRecurrenceDate('2026-10-03', rule({ unit: 'day' })), '2026-10-04');
  assert.equal(nextRecurrenceDate('2026-10-03', rule({ unit: 'day', interval: 10 })), '2026-10-13');
  assert.equal(nextRecurrenceDate('2026-01-01', rule({ unit: 'day', interval: 100 })), '2026-04-10');

  assert.equal(
    nextRecurrenceDate('2026-10-07', rule({ unit: 'week', weekday: 3 })),
    '2026-10-14',
  );
  assert.equal(
    nextRecurrenceDate('2026-10-05', rule({ unit: 'week', weekday: 3 })),
    '2026-10-07',
  );
  assert.equal(
    nextRecurrenceDate('2026-10-05', rule({ unit: 'week', interval: 2, weekday: 3 })),
    '2026-10-14',
  );
  assert.equal(
    nextRecurrenceDate('2026-10-07', rule({ unit: 'week', interval: 2, weekday: 3 })),
    '2026-10-21',
  );
  assert.equal(
    nextRecurrenceDate('2026-10-05', rule({ unit: 'week', weekday: 0 })),
    '2026-10-11',
  );
  assert.equal(nextRecurrenceDate('2026-10-03', rule({ unit: 'week' })), '2026-10-10');

  assert.equal(nextRecurrenceDate('2026-01-31', rule({ unit: 'month' })), '2026-02-28');
  assert.equal(nextRecurrenceDate('2024-01-31', rule({ unit: 'month' })), '2024-02-29');
  assert.equal(nextRecurrenceDate('2026-01-31', rule({ unit: 'month', interval: 2 })), '2026-03-31');
  assert.equal(nextRecurrenceDate('2026-03-31', rule({ unit: 'month' })), '2026-04-30');
  assert.equal(nextRecurrenceDate('2026-12-15', rule({ unit: 'month', interval: 2 })), '2027-02-15');
  assert.equal(nextRecurrenceDate('2024-02-29', rule({ unit: 'month', interval: 12 })), '2025-02-28');
});

test('next date rejects a missing rule or a calendar-invalid anchor', () => {
  assert.equal(nextRecurrenceDate('2026-10-03', rule({ unit: null })), null);
  assert.equal(nextRecurrenceDate('2026-02-31', rule({ unit: 'day' })), null);
  assert.equal(nextRecurrenceDate('not-a-date', rule({ unit: 'day' })), null);
});

test('repeat phrases and the preset each stored rule maps to', () => {
  assert.equal(describeRepeat(rule({ unit: null })), null);
  assert.equal(describeRepeat(rule({ unit: 'day' })), 'Repeats daily');
  assert.equal(describeRepeat(rule({ unit: 'day', interval: 3 })), 'Repeats every 3 days');
  assert.equal(
    describeRepeat(rule({ unit: 'week', weekday: 3 })),
    'Repeats weekly on Wednesday',
  );
  assert.equal(
    describeRepeat(rule({ unit: 'week', interval: 2, weekday: 1 })),
    'Repeats every 2 weeks on Monday',
  );
  assert.equal(describeRepeat(rule({ unit: 'month' })), 'Repeats monthly');
  assert.equal(describeRepeat(rule({ unit: 'month', interval: 4 })), 'Repeats every 4 months');

  assert.equal(repeatChoice(rule({ unit: null })), 'never');
  assert.equal(repeatChoice(rule({ unit: 'day' })), 'daily');
  assert.equal(repeatChoice(rule({ unit: 'week', weekday: 3 })), 'weekly');
  assert.equal(repeatChoice(rule({ unit: 'month' })), 'monthly');
  assert.equal(repeatChoice(rule({ unit: 'day', interval: 2 })), 'custom');

  assert.equal(
    repeatScheduleCopy(rule({ unit: 'week', weekday: 3 }), '14 Oct', true),
    'Repeats weekly on Wednesday. Next is 14 Oct.',
  );
  assert.equal(
    repeatScheduleCopy(rule({ unit: 'day' }), null, false),
    'Repeats daily. The next date is counted from the day this is completed.',
  );
});
