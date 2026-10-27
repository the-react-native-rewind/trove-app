import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyHandoffToCache,
  assigneeTap,
  canHandOff,
  formatHandoffAge,
  normalizeLatestHandoff,
  normalizeLogCount,
  visibleHandoffNote,
} from './handoff';

const sam = { id: 'sam' };
const priya = { id: 'priya' };

test('a handoff note shows only while the recipient still has the open task', () => {
  const handoff = { note: 'Half done', to_user_id: 'sam' };
  assert.equal(
    visibleHandoffNote({ status: 'in_progress', assignees: [sam, priya], latest_handoff: handoff }),
    'Half done',
  );
  assert.equal(
    visibleHandoffNote({ status: 'done', assignees: [sam], latest_handoff: handoff }),
    null,
  );
  assert.equal(
    visibleHandoffNote({ status: 'todo', assignees: [priya], latest_handoff: handoff }),
    null,
  );
  assert.equal(
    visibleHandoffNote({ status: 'todo', assignees: [sam], latest_handoff: { note: '  ', to_user_id: 'sam' } }),
    null,
  );
  assert.equal(visibleHandoffNote({ status: 'todo', assignees: [sam], latest_handoff: null }), null);
});

test('the edit picker prompts only when the task is yours and still open', () => {
  assert.equal(
    assigneeTap({
      callerIsAssignee: true,
      taskDone: false,
      tappedId: 'sam',
      callerId: 'luke',
      alreadySelected: false,
    }),
    'prompt',
  );
  assert.equal(
    assigneeTap({
      callerIsAssignee: true,
      taskDone: false,
      tappedId: 'sam',
      callerId: 'luke',
      alreadySelected: true,
    }),
    'remove',
  );
  assert.equal(
    assigneeTap({
      callerIsAssignee: true,
      taskDone: true,
      tappedId: 'sam',
      callerId: 'luke',
      alreadySelected: false,
    }),
    'add',
  );
  assert.equal(
    assigneeTap({
      callerIsAssignee: true,
      taskDone: false,
      tappedId: 'luke',
      callerId: 'luke',
      alreadySelected: false,
    }),
    'add',
  );
  assert.equal(
    assigneeTap({
      callerIsAssignee: false,
      taskDone: false,
      tappedId: 'sam',
      callerId: 'luke',
      alreadySelected: false,
    }),
    'add',
  );
});

test('hand off is hidden on a personal circle and on a done task', () => {
  assert.equal(
    canHandOff({
      callerId: 'luke',
      writable: true,
      status: 'todo',
      assigneeIds: ['luke'],
      otherMemberCount: 2,
    }),
    true,
  );
  assert.equal(
    canHandOff({
      callerId: 'luke',
      writable: true,
      status: 'todo',
      assigneeIds: ['luke'],
      otherMemberCount: 0,
    }),
    false,
  );
  assert.equal(
    canHandOff({
      callerId: 'luke',
      writable: true,
      status: 'done',
      assigneeIds: ['luke'],
      otherMemberCount: 2,
    }),
    false,
  );
  assert.equal(
    canHandOff({
      callerId: 'luke',
      writable: false,
      status: 'todo',
      assigneeIds: ['luke'],
      otherMemberCount: 2,
    }),
    false,
  );
  assert.equal(
    canHandOff({
      callerId: 'luke',
      writable: true,
      status: 'in_progress',
      assigneeIds: ['sam'],
      otherMemberCount: 2,
    }),
    false,
  );
});

test('handoff ages read as just now, minutes, hours, and days', () => {
  const now = Date.parse('2026-10-27T12:00:00.000Z');
  assert.equal(formatHandoffAge('2026-10-27T11:59:30.000Z', now), 'just now');
  assert.equal(formatHandoffAge('2026-10-27T11:55:00.000Z', now), '5m ago');
  assert.equal(formatHandoffAge('2026-10-27T10:00:00.000Z', now), '2h ago');
  assert.equal(formatHandoffAge('2026-10-24T12:00:00.000Z', now), '3d ago');
});

test('the newest embedded handoff wins and the log count is the first row', () => {
  const handoff = normalizeLatestHandoff([
    {
      id: 'old',
      from_user_id: 'luke',
      to_user_id: 'sam',
      status: 'todo',
      note: 'Earlier',
      created_at: '2026-10-01T00:00:00.000Z',
      from_profile: { id: 'luke', display_name: 'Luke', avatar_url: null },
      to_profile: { id: 'sam', display_name: 'Sam', avatar_url: null },
    },
    {
      id: 'new',
      from_user_id: 'luke',
      to_user_id: 'priya',
      status: 'in_progress',
      note: '  Half done  ',
      created_at: '2026-10-27T00:00:00.000Z',
      from_profile: { id: 'luke', display_name: 'Luke', avatar_url: 'https://example.com/l.png' },
      to_profile: [{ id: 'priya', display_name: 'Priya', avatar_url: null }],
    },
  ]);
  assert.equal(handoff?.id, 'new');
  assert.equal(handoff?.note, 'Half done');
  assert.equal(handoff?.from_name, 'Luke');
  assert.equal(handoff?.to_name, 'Priya');
  assert.equal(handoff?.status, 'in_progress');
  assert.equal(normalizeLogCount([{ count: 4 }]), 4);
  assert.equal(normalizeLogCount(null), 0);
});

test('an optimistic handoff leaves Mine and keeps a co-assignee in place', () => {
  const input = {
    taskId: 'task-1',
    callerId: 'luke',
    toUserId: 'priya',
    toName: 'Priya',
    toAvatarUrl: null,
    fromName: 'Luke',
    fromAvatarUrl: null,
    status: 'in_progress' as const,
    note: 'Half done',
  };
  const people = [
    { id: 'luke', display_name: 'Luke', avatar_url: null },
    { id: 'sam', display_name: 'Sam', avatar_url: null },
  ];
  const mine = applyHandoffToCache(
    [{ id: 'task-1', status: 'todo', assignees: people, title: 'Gate' }],
    input,
    true,
  );
  assert.deepEqual(mine, []);

  const circle = applyHandoffToCache(
    [{ id: 'task-1', status: 'todo', assignees: people }],
    input,
    false,
  ) as { assignees: { id: string }[]; status: string; latest_handoff: { note: string } }[];
  assert.deepEqual(
    circle[0]?.assignees.map((person) => person.id),
    ['priya', 'sam'],
  );
  assert.equal(circle[0]?.status, 'in_progress');
  assert.equal(circle[0]?.latest_handoff.note, 'Half done');

  const kept = applyHandoffToCache(
    [
      {
        id: 'task-1',
        status: 'todo',
        assignees: [
          { id: 'luke', display_name: 'Luke', avatar_url: null },
          { id: 'priya', display_name: 'Priya', avatar_url: null },
        ],
      },
    ],
    input,
    false,
  ) as { assignees: { id: string }[] }[];
  assert.deepEqual(
    kept[0]?.assignees.map((person) => person.id),
    ['priya'],
  );
});
