import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MCP_TOOL_NAMES,
  TASK_MEDIA_MAX_BYTES,
  TroveError,
  type AttachmentRecord,
  type Circle,
  type CreateTaskInput,
  type InviteResult,
  type Member,
  type MoveResult,
  type Role,
  type TaskPatch,
  type TaskRecord,
  type TaskWrite,
  type TroveStore,
  addTaskAttachment,
  assignTask,
  bytesMatchContentType,
  checkAttachmentSize,
  completeTask,
  createCircle,
  createTask,
  createTasksBulk,
  getCircle,
  inviteToCircle,
  listCircles,
  listCircleTasks,
  listMyTasks,
  moveTask,
  planMove,
  resolveRepeat,
  updateTask,
  weekdayOfDate,
} from './mcpTools';
import { inviteUrl } from './links';

const ME = 'user-me';
const SAM = 'user-sam';
const PERSONAL = 'circle-personal';
const HOUSE = 'circle-house';

test('the tool catalog matches the handlers we ship', () => {
  assert.deepEqual(MCP_TOOL_NAMES, [
    'list_circles',
    'get_circle',
    'create_circle',
    'list_my_tasks',
    'list_circle_tasks',
    'create_task',
    'create_tasks_bulk',
    'update_task',
    'complete_task',
    'assign_task',
    'move_task',
    'add_task_attachment',
    'list_members',
    'invite_to_circle',
  ]);
});

test('planMove keeps a member assignee and clears anyone outside the destination', () => {
  const kept = planMove({
    callerSourceRole: 'owner',
    callerIsTargetMember: true,
    targetExists: true,
    sourceCircleId: PERSONAL,
    targetCircleId: HOUSE,
    assigneeId: ME,
    targetMemberIds: [ME, SAM],
    tags: [{ name: 'shop', circle_id: PERSONAL }],
  });
  assert.equal(kept.ok, true);
  if (!kept.ok) return;
  assert.equal(kept.assigneeCleared, false);
  assert.equal(kept.nextAssigneeId, ME);
  assert.equal(kept.tagsRemoved, 1);

  const cleared = planMove({
    callerSourceRole: 'member',
    callerIsTargetMember: true,
    targetExists: true,
    sourceCircleId: HOUSE,
    targetCircleId: PERSONAL,
    assigneeId: SAM,
    targetMemberIds: [ME],
    tags: [],
  });
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.assigneeCleared, true);
  assert.equal(cleared.nextAssigneeId, null);

  const viewer = planMove({
    callerSourceRole: 'viewer',
    callerIsTargetMember: true,
    targetExists: true,
    sourceCircleId: HOUSE,
    targetCircleId: PERSONAL,
    assigneeId: null,
    targetMemberIds: [ME],
    tags: [],
  });
  assert.deepEqual(viewer, { ok: false, error: 'You cannot edit tasks in this circle' });

  const stranger = planMove({
    callerSourceRole: 'member',
    callerIsTargetMember: false,
    targetExists: true,
    sourceCircleId: HOUSE,
    targetCircleId: 'circle-other',
    assigneeId: null,
    targetMemberIds: [],
    tags: [],
  });
  assert.deepEqual(stranger, { ok: false, error: 'Circle not found' });
});

test('create_task defaults to the personal circle and assigns the caller', async () => {
  const store = memoryStore();
  const created = await createTask(store, { title: '  Call the plumber  ', notes: 'Leak under the sink' });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.data.existing, false);
  assert.equal(created.data.task.title, 'Call the plumber');
  assert.equal(created.data.task.circle_id, PERSONAL);
  assert.equal(created.data.task.assignee_id, ME);
  assert.equal(created.data.task.notes, 'Leak under the sink');
  assert.equal(created.data.task.status, 'todo');
});

test('a viewer cannot create or move, and Mine is not a circle', async () => {
  const store = memoryStore({ houseRole: 'viewer' });
  const created = await createTask(store, { title: 'Nope', circle_name: 'House' });
  assert.deepEqual(created, { ok: false, error: 'You cannot edit tasks in this circle' });

  const mine = await createTask(store, { title: 'Nope', circle_name: 'Mine' });
  assert.equal(mine.ok, false);
  if (mine.ok) return;
  assert.equal(mine.error.includes('not a circle'), true);

  const task = await createTask(store, { title: 'Stay put' });
  assert.equal(task.ok, true);
  if (!task.ok) return;
  store.setRole(PERSONAL, 'viewer');
  const moved = await moveTask(store, { task_id: task.data.task.id, circle_name: 'House' });
  assert.deepEqual(moved, { ok: false, error: 'You cannot edit tasks in this circle' });
});

test('move_task keeps the caller when they belong to the destination and drops old tags', async () => {
  const store = memoryStore();
  const created = await createTask(store, {
    title: 'Buy paint',
    tags: ['shop'],
    personal: true,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const moved = await moveTask(store, { task_id: created.data.task.id, circle_name: 'house' });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.data.already_there, false);
  assert.equal(moved.data.assignee_cleared, false);
  assert.equal(moved.data.task.circle_id, HOUSE);
  assert.equal(moved.data.task.assignee_id, ME);
  assert.equal(moved.data.tags_removed, 1);
  assert.deepEqual(moved.data.task.tags, []);
});

test('move_task clears an assignee who is not in the destination circle', async () => {
  const store = memoryStore();
  const created = await createTask(store, {
    title: 'Mow the lawn',
    circle_name: 'House',
    assignee: 'Sam',
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.data.task.assignee_id, SAM);

  const moved = await moveTask(store, { task_id: created.data.task.id, personal: true });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.data.assignee_cleared, true);
  assert.equal(moved.data.task.assignee_id, null);
  assert.equal(moved.data.task.circle_id, PERSONAL);
});

test('create and list tasks include the repeat rule and series id', async () => {
  const store = memoryStore();
  const created = await createTask(store, {
    title: 'Bins',
    circle_name: 'House',
    due_date: '2026-10-07',
    repeat_unit: 'week',
    repeat_interval: 1,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.data.task.repeat_unit, 'week');
  assert.equal(created.data.task.repeat_interval, 1);
  assert.equal(created.data.task.repeat_weekday, 3);
  assert.equal(created.data.task.recurrence_series_id, created.data.task.id);
  assert.equal(Object.hasOwn(created.data.task, 'recurrence_source_id'), false);

  const daily = await createTask(store, {
    title: 'Water',
    personal: true,
    repeat_unit: 'day',
    repeat_interval: 2,
  });
  assert.equal(daily.ok, true);
  if (!daily.ok) return;
  assert.equal(daily.data.task.repeat_unit, 'day');
  assert.equal(daily.data.task.repeat_interval, 2);
  assert.equal(daily.data.task.repeat_weekday, null);
  assert.equal(daily.data.task.recurrence_series_id, daily.data.task.id);

  const listed = await listCircleTasks(store, { circle_name: 'House' });
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.data.tasks[0]?.repeat_unit, 'week');
  assert.equal(listed.data.tasks[0]?.recurrence_series_id, created.data.task.id);

  const mine = await listMyTasks(store, {});
  assert.equal(mine.ok, true);
  if (!mine.ok) return;
  const water = mine.data.tasks.find((task) => task.title === 'Water');
  assert.equal(water?.title, 'Water');
  if (!water) return;
  assert.equal(water.repeat_interval, 2);
  assert.equal(Object.hasOwn(water, 'recurrence_source_id'), false);

  const once = await createTask(store, { title: 'Once', repeat_unit: 'never' });
  assert.equal(once.ok, true);
  if (!once.ok) return;
  assert.equal(once.data.task.repeat_unit, null);
  assert.equal(once.data.task.recurrence_series_id, null);
});

test('repeat rules reject bad values and never clears without dropping the series', async () => {
  const store = memoryStore();
  const missingUnit = await createTask(store, { title: 'Nope', repeat_interval: 3 });
  assert.deepEqual(missingUnit, { ok: false, error: 'Set repeat_unit to day, week, or month before repeat_interval.' });

  const badInterval = await createTask(store, { title: 'Nope', repeat_unit: 'month', repeat_interval: 100 });
  assert.deepEqual(badInterval, { ok: false, error: 'repeat_interval must be an integer from 1 to 99.' });

  const badWeekday = await createTask(store, { title: 'Nope', repeat_unit: 'week', repeat_weekday: 7 });
  assert.deepEqual(badWeekday, {
    ok: false,
    error: 'repeat_weekday must be an integer from 0 (Sunday) to 6 (Saturday), or null.',
  });

  const weekdayOnDay = await createTask(store, { title: 'Nope', repeat_unit: 'day', repeat_weekday: 1 });
  assert.deepEqual(weekdayOnDay, { ok: false, error: 'repeat_weekday is only used when repeat_unit is week.' });

  const created = await createTask(store, {
    title: 'Bins',
    due_date: '2026-10-07',
    repeat_unit: 'week',
    repeat_weekday: 3,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const cleared = await updateTask(store, { task_id: created.data.task.id, repeat_unit: 'never' });
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.data.task.repeat_unit, null);
  assert.equal(cleared.data.task.repeat_interval, 1);
  assert.equal(cleared.data.task.repeat_weekday, null);
  assert.equal(cleared.data.task.recurrence_series_id, created.data.task.id);

  const nulled = await updateTask(store, { task_id: created.data.task.id, repeat_unit: null });
  assert.equal(nulled.ok, true);
  if (!nulled.ok) return;
  assert.equal(nulled.data.task.repeat_unit, null);

  const conflict = await updateTask(store, {
    task_id: created.data.task.id,
    repeat_unit: 'never',
    repeat_interval: 2,
  });
  assert.deepEqual(conflict, {
    ok: false,
    error: 'repeat_unit null or never clears the rule. Omit repeat_interval and repeat_weekday.',
  });

  const again = await updateTask(store, {
    task_id: created.data.task.id,
    repeat_unit: 'week',
    repeat_interval: 2,
  });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.data.task.repeat_unit, 'week');
  assert.equal(again.data.task.repeat_interval, 2);
  assert.equal(again.data.task.repeat_weekday, 3);
  assert.equal(again.data.task.recurrence_series_id, created.data.task.id);
});

test('a week with no due date uses the UTC weekday, and bulk create stores the rule', async () => {
  assert.equal(weekdayOfDate('2026-10-03'), 6);
  const resolved = resolveRepeat({
    input: { repeat_unit: 'week' },
    current: { repeat_unit: null, repeat_interval: 1, repeat_weekday: null },
    dueDate: null,
    todayUtc: '2026-10-03',
    mode: 'create',
  });
  assert.deepEqual(resolved, { repeat_unit: 'week', repeat_interval: 1, repeat_weekday: 6 });

  const store = memoryStore();
  const bulk = await createTasksBulk(store, {
    personal: true,
    tasks: [{ title: 'Stretch', repeat_unit: 'month' }],
  });
  assert.equal(bulk.ok, true);
  if (!bulk.ok) return;
  assert.equal(bulk.data.created[0]?.repeat_unit, 'month');
  assert.equal(bulk.data.created[0]?.repeat_interval, 1);
  assert.equal(bulk.data.created[0]?.repeat_weekday, null);
  assert.equal(bulk.data.created[0]?.recurrence_series_id, bulk.data.created[0]?.id);
});

test('a viewer of the destination can still receive a task', async () => {
  const store = memoryStore({ houseRole: 'viewer' });
  const created = await createTask(store, { title: 'Shared later', assignee: 'me' });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const moved = await moveTask(store, { task_id: created.data.task.id, circle_id: HOUSE });
  assert.equal(moved.ok, true);
  if (!moved.ok) return;
  assert.equal(moved.data.task.circle_id, HOUSE);
  assert.equal(moved.data.assignee_cleared, false);
});

test('bulk import is idempotent on external_id and refuses more than 100 tasks', async () => {
  const store = memoryStore();
  const first = await createTasksBulk(store, {
    circle_name: 'House',
    tasks: [
      { title: 'Bins', external_id: 'notion-1' },
      { title: 'Bins again', external_id: 'notion-1' },
      { title: '' },
    ],
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.data.created.length, 1);
  assert.equal(first.data.existing.length, 1);
  assert.equal(first.data.existing[0]?.id, first.data.created[0]?.id);
  assert.equal(first.data.failed.length, 1);
  assert.equal(store.tasks.length, 1);

  const retry = await createTask(store, { title: 'Ignored', external_id: 'notion-1', personal: true });
  assert.equal(retry.ok, true);
  if (!retry.ok) return;
  assert.equal(retry.data.existing, true);
  assert.equal(retry.data.task.circle_id, HOUSE);
  assert.equal(store.tasks.length, 1);

  const tooMany: CreateTaskInput[] = Array.from({ length: 101 }, (_, index) => ({
    title: `Task ${index}`,
  }));
  const rejected = await createTasksBulk(store, { tasks: tooMany });
  assert.equal(rejected.ok, false);
  assert.equal(store.tasks.length, 1);
});

test('list_my_tasks filters by circle, status, and due date', async () => {
  const store = memoryStore();
  await createTask(store, { title: 'Today', due_date: '2026-10-01', personal: true });
  await createTask(store, {
    title: 'Later',
    due_date: '2026-10-20',
    circle_name: 'House',
    status: 'in_progress',
  });
  await createTask(store, { title: 'Done already', status: 'done', personal: true });

  const mine = await listMyTasks(store, { due_before: '2026-10-10' });
  assert.equal(mine.ok, true);
  if (!mine.ok) return;
  assert.deepEqual(
    mine.data.tasks.map((task) => task.title),
    ['Today'],
  );

  const house = await listMyTasks(store, { circle_name: 'House', status: 'in_progress' });
  assert.equal(house.ok, true);
  if (!house.ok) return;
  assert.deepEqual(
    house.data.tasks.map((task) => task.title),
    ['Later'],
  );
});

test('assign_task resolves a display name and complete_task marks done', async () => {
  const store = memoryStore();
  const created = await createTask(store, { title: 'Choir music', circle_name: 'House', assignee: null });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.data.task.assignee_id, null);

  const assigned = await assignTask(store, { task_id: created.data.task.id, assignee: 'sam' });
  assert.equal(assigned.ok, true);
  if (!assigned.ok) return;
  assert.equal(assigned.data.task.assignee_id, SAM);

  const missing = await assignTask(store, { task_id: created.data.task.id, assignee: 'Priya' });
  assert.equal(missing.ok, false);

  const done = await completeTask(store, { task_id: created.data.task.id });
  assert.equal(done.ok, true);
  if (!done.ok) return;
  assert.equal(done.data.task.status, 'done');
});

test('invite_to_circle rejects viewers and the owner role', async () => {
  const store = memoryStore({ houseRole: 'member' });
  const denied = await inviteToCircle(store, {
    circle_name: 'House',
    email: 'friend@example.com',
  });
  assert.equal(denied.ok, false);

  store.setRole(HOUSE, 'admin');
  const owner = await inviteToCircle(store, {
    circle_name: 'House',
    email: 'friend@example.com',
    role: 'owner',
  });
  assert.equal(owner.ok, false);

  const invited = await inviteToCircle(store, {
    circle_name: 'House',
    email: ' Friend@Example.com ',
  });
  assert.equal(invited.ok, true);
  if (!invited.ok) return;
  assert.equal(invited.data.invite.email, 'friend@example.com');
  assert.equal(invited.data.invite.role, 'member');
  assert.equal(invited.data.invite.url.startsWith('https://'), true);
  assert.equal(invited.data.invite.url.includes('/open?to=invite%2F'), true);
});

test('open-task counts are loaded only for circle reads', async () => {
  const store = memoryStore();
  await createTask(store, { title: 'No count' });
  assert.equal(store.calls.counts, 0);
  assert.equal(store.calls.plain > 0, true);

  store.calls.plain = 0;
  const listed = await listCircles(store);
  assert.equal(listed.ok, true);
  const fetched = await getCircle(store, { circle_name: 'House' });
  assert.equal(fetched.ok, true);
  assert.equal(store.calls.counts, 2);
  assert.equal(store.calls.plain, 0);
});

test('create_circle makes the caller the owner and keeps the personal circle', async () => {
  const store = memoryStore();
  const created = await createCircle(store, { name: '  Garden  ', color: 'Terracotta' });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.data.circle.name, 'Garden');
  assert.equal(created.data.circle.color, 'terracotta');
  assert.equal(created.data.circle.role, 'owner');
  assert.equal(created.data.circle.is_personal, false);
  assert.equal(created.data.circle.open_task_count, 0);
  assert.equal(/^circle-/.test(created.data.circle.id), true);

  const listed = await listCircles(store);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.data.circles.some((circle) => circle.id === created.data.circle.id), true);
  assert.equal(store.membersOf(created.data.circle.id).some((member) => member.user_id === ME && member.role === 'owner'), true);

  const personal = await createCircle(store, { name: 'Notes', color: '#C16E43' });
  assert.equal(personal.ok, true);
  if (!personal.ok) return;
  assert.equal(personal.data.circle.color, '#c16e43');
  assert.equal(personal.data.circle.is_personal, false);

  const unnamed = await createCircle(store, { name: '   ' });
  assert.deepEqual(unnamed, { ok: false, error: 'Give your circle a name, like Home or Garden.' });

  const emoji = await createCircle(store, { name: 'Garden', color: '🌿' });
  assert.equal(emoji.ok, false);
});

test('add_task_attachment stores images in app order and rejects viewers', async () => {
  const store = memoryStore();
  const created = await createTask(store, { title: 'Call the plumber', personal: true });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const taskId = created.data.task.id;

  const first = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'image/jpeg',
    filename: 'leak.JPEG',
    data_base64: toBase64(jpegBytes()),
  });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(new RegExp(`^${PERSONAL}/${taskId}/[0-9a-f-]{36}\\.jpeg$`).test(first.data.attachment.path), true);
  assert.equal(first.data.attachment.media_type, 'image');
  assert.equal(first.data.attachment.id.length > 0, true);

  const second = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'video/mp4',
    filename: 'clip.mp4',
    data_base64: toBase64(mp4Bytes()),
  });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(/\.mp4$/.test(second.data.attachment.path), true);
  assert.equal(second.data.attachment.media_type, 'video');
  assert.deepEqual(
    store.attachments.map((item) => item.id),
    [first.data.attachment.id, second.data.attachment.id],
  );
  assert.equal(store.attachments[0]?.created_at < store.attachments[1]?.created_at, true);

  const mismatch = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'image/png',
    data_base64: toBase64(jpegBytes()),
  });
  assert.deepEqual(mismatch, { ok: false, error: 'File contents do not match content_type.' });

  store.setRole(PERSONAL, 'viewer');
  const denied = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'image/jpeg',
    data_base64: toBase64(jpegBytes()),
  });
  assert.deepEqual(denied, { ok: false, error: 'You cannot edit tasks in this circle' });
  assert.equal(store.attachments.length, 2);

  const missing = await addTaskAttachment(store, {
    task_id: 'task-missing',
    content_type: 'image/png',
    url: 'https://cdn.example/secret.png',
  });
  assert.deepEqual(missing, { ok: false, error: 'Task not found' });
});

test('add_task_attachment downloads a public https file and rejects private URLs', async () => {
  const store = memoryStore();
  const created = await createTask(store, { title: 'Photo', circle_name: 'House' });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const taskId = created.data.task.id;
  const fetched: string[] = [];

  const saved = await addTaskAttachment(
    store,
    {
      task_id: taskId,
      content_type: 'image/png',
      filename: 'shot.png',
      url: 'https://cdn.example/start',
    },
    {
      resolveDns: async () => ['1.1.1.1'],
      fetch: async (input, init) => {
        const href = String(input);
        fetched.push(href);
        assert.equal(init?.redirect, 'manual');
        if (href.endsWith('/start')) {
          return new Response(null, { status: 302, headers: { location: 'https://cdn.example/shot.png' } });
        }
        return new Response(asBody(pngBytes()), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        });
      },
    },
  );
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.data.attachment.circle_id, HOUSE);
  assert.equal(new RegExp(`^${HOUSE}/${taskId}/`).test(saved.data.attachment.path), true);
  assert.deepEqual(fetched, ['https://cdn.example/start', 'https://cdn.example/shot.png']);

  const blocked = await addTaskAttachment(
    store,
    { task_id: taskId, content_type: 'image/png', url: 'https://127.0.0.1/photo.png' },
    { fetch: async () => { throw new Error('should not fetch'); } },
  );
  assert.deepEqual(blocked, { ok: false, error: 'That URL is not allowed.' });

  const http = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'image/png',
    url: 'http://cdn.example/shot.png',
  });
  assert.equal(http.ok, false);

  const both = await addTaskAttachment(store, {
    task_id: taskId,
    content_type: 'image/png',
    url: 'https://cdn.example/shot.png',
    data_base64: toBase64(pngBytes()),
  });
  assert.deepEqual(both, { ok: false, error: 'Pass a public https URL or base64 data, not both.' });

  const rebinding = await addTaskAttachment(
    store,
    { task_id: taskId, content_type: 'image/png', url: 'https://cdn.example/shot.png' },
    {
      resolveDns: async () => ['10.1.2.3'],
      fetch: async () => {
        throw new Error('should not fetch');
      },
    },
  );
  assert.deepEqual(rebinding, { ok: false, error: 'That URL is not allowed.' });
});

test('attachment bytes must match an allowed image or video', () => {
  assert.equal(bytesMatchContentType(jpegBytes(), 'image/jpeg'), true);
  assert.equal(bytesMatchContentType(pngBytes(), 'image/png'), true);
  assert.equal(bytesMatchContentType(mp4Bytes(), 'video/mp4'), true);
  assert.equal(bytesMatchContentType(jpegBytes(), 'image/png'), false);
  assert.equal(checkAttachmentSize(0), 'The file is empty.');
  assert.equal(checkAttachmentSize(TASK_MEDIA_MAX_BYTES), null);
  assert.equal(checkAttachmentSize(TASK_MEDIA_MAX_BYTES + 1), 'File must be 50 MB or smaller.');
});

test('update_task replaces tags and does not take a circle id', async () => {
  const store = memoryStore();
  const created = await createTask(store, { title: 'Label me', tags: ['old'], circle_name: 'House' });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const updated = await updateTask(store, {
    task_id: created.data.task.id,
    tags: ['new'],
    notes: null,
  });
  assert.equal(updated.ok, true);
  if (!updated.ok) return;
  assert.deepEqual(updated.data.task.tags, ['new']);
  assert.equal(updated.data.task.notes, null);
  assert.equal(updated.data.task.circle_id, HOUSE);
});

function memoryStore(options?: { houseRole?: Role }): TroveStore & {
  tasks: TaskRecord[];
  attachments: AttachmentRecord[];
  calls: { counts: number; plain: number };
  setRole: (circleId: string, role: Role) => void;
  membersOf: (circleId: string) => Member[];
} {
  const circles: Circle[] = [
    {
      id: PERSONAL,
      name: 'Personal',
      color: 'sage',
      role: 'owner',
      is_personal: true,
      open_task_count: 0,
    },
    {
      id: HOUSE,
      name: 'House',
      color: 'terracotta',
      role: options?.houseRole ?? 'owner',
      is_personal: false,
      open_task_count: 0,
    },
  ];
  const members: Record<string, Member[]> = {
    [PERSONAL]: [{ user_id: ME, display_name: 'Luke', role: 'owner' }],
    [HOUSE]: [
      { user_id: ME, display_name: 'Luke', role: circles[1]?.role ?? 'owner' },
      { user_id: SAM, display_name: 'Sam', role: 'member' },
    ],
  };
  const tasks: TaskRecord[] = [];
  const attachments: AttachmentRecord[] = [];
  const calls = { counts: 0, plain: 0 };
  let counter = 0;

  const store: TroveStore & {
    tasks: TaskRecord[];
    attachments: AttachmentRecord[];
    calls: { counts: number; plain: number };
    setRole: (circleId: string, role: Role) => void;
    membersOf: (circleId: string) => Member[];
  } = {
    userId: ME,
    tasks,
    attachments,
    calls,
    membersOf(circleId) {
      return (members[circleId] ?? []).map((member) => ({ ...member }));
    },
    setRole(circleId, role) {
      const circle = circles.find((item) => item.id === circleId);
      if (circle) circle.role = role;
      const roster = members[circleId];
      const mine = roster?.find((member) => member.user_id === ME);
      if (mine) mine.role = role;
    },
    async listCircles(options) {
      if (options?.includeOpenCounts) calls.counts += 1;
      else calls.plain += 1;
      return circles.map((circle) => ({ ...circle }));
    },
    async listMembers(circleId) {
      return (members[circleId] ?? []).map((member) => ({ ...member }));
    },
    async listTasks(filter) {
      return tasks
        .filter((task) => (filter.circleId ? task.circle_id === filter.circleId : true))
        .filter((task) => (filter.assigneeId ? task.assignee_id === filter.assigneeId : true))
        .filter((task) => (filter.status ? task.status === filter.status : true))
        .filter((task) => (filter.dueOn ? task.due_date === filter.dueOn : true))
        .filter((task) => (filter.dueBefore ? task.due_date !== null && task.due_date <= filter.dueBefore : true))
        .filter((task) => (filter.dueAfter ? task.due_date !== null && task.due_date >= filter.dueAfter : true))
        .slice(0, filter.limit);
    },
    async getTask(id) {
      return tasks.find((task) => task.id === id) ?? null;
    },
    async findByExternalId(externalId) {
      return tasks.find((task) => task.external_id === externalId) ?? null;
    },
    async insertTask(input: TaskWrite) {
      counter += 1;
      const circle = circles.find((item) => item.id === input.circleId);
      const assignee = Object.values(members)
        .flat()
        .find((member) => member.user_id === input.assigneeId);
      const task: TaskRecord = {
        id: `task-${counter}`,
        title: input.title,
        notes: input.notes,
        status: input.status,
        priority: input.priority,
        rank: 'a0',
        due_date: input.dueDate,
        circle_id: input.circleId,
        circle_name: circle?.name ?? '',
        assignee_id: input.assigneeId,
        assignee_name: assignee?.display_name ?? null,
        tags: input.tags,
        external_id: input.externalId,
        repeat_unit: input.repeatUnit,
        repeat_interval: input.repeatInterval,
        repeat_weekday: input.repeatWeekday,
        recurrence_series_id: input.repeatUnit ? `task-${counter}` : null,
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-01T00:00:00.000Z',
      };
      tasks.push(task);
      return task;
    },
    async updateTask(id, patch: TaskPatch) {
      const task = tasks.find((item) => item.id === id);
      if (!task) return null;
      if (patch.title !== undefined) task.title = patch.title;
      if (patch.notes !== undefined) task.notes = patch.notes;
      if (patch.status !== undefined) task.status = patch.status;
      if (patch.priority !== undefined) task.priority = patch.priority;
      if (patch.dueDate !== undefined) task.due_date = patch.dueDate;
      if (patch.assigneeId !== undefined) {
        task.assignee_id = patch.assigneeId;
        const assignee = Object.values(members)
          .flat()
          .find((member) => member.user_id === patch.assigneeId);
        task.assignee_name = assignee?.display_name ?? null;
      }
      if (patch.tags !== undefined) task.tags = patch.tags;
      if (patch.repeatUnit !== undefined) {
        task.repeat_unit = patch.repeatUnit;
        task.repeat_interval = patch.repeatInterval ?? 1;
        task.repeat_weekday = patch.repeatWeekday ?? null;
        if (patch.repeatUnit && !task.recurrence_series_id) task.recurrence_series_id = task.id;
      }
      return task;
    },
    async moveTask(taskId, targetCircleId): Promise<MoveResult> {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) throw new TroveError('Task not found');
      const source = circles.find((item) => item.id === task.circle_id);
      const target = circles.find((item) => item.id === targetCircleId);
      const roster = members[targetCircleId] ?? [];
      const plan = planMove({
        callerSourceRole: source?.role ?? null,
        callerIsTargetMember: Boolean(target && roster.some((member) => member.user_id === ME)),
        targetExists: Boolean(target),
        sourceCircleId: task.circle_id,
        targetCircleId,
        assigneeId: task.assignee_id,
        targetMemberIds: roster.map((member) => member.user_id),
        tags: task.tags.map((name) => ({ name, circle_id: task.circle_id })),
      });
      if (!plan.ok) throw new TroveError(plan.error);
      const sourceId = task.circle_id;
      if (!plan.alreadyThere) {
        task.circle_id = targetCircleId;
        task.circle_name = target?.name ?? '';
        task.assignee_id = plan.nextAssigneeId;
        if (plan.assigneeCleared) task.assignee_name = null;
        task.tags = [];
      }
      return {
        task_id: task.id,
        source_circle_id: sourceId,
        target_circle_id: targetCircleId,
        assignee_cleared: plan.assigneeCleared,
        already_there: plan.alreadyThere,
        tags_removed: plan.tagsRemoved,
        task,
      };
    },
    async createInvite(input): Promise<InviteResult> {
      return {
        id: 'invite-1',
        circle_id: input.circleId,
        email: input.email,
        role: input.role,
        token: 'invite-token',
        expires_at: '2026-10-15T00:00:00.000Z',
        url: inviteUrl('invite-token'),
      };
    },
    async createCircle(input) {
      counter += 1;
      const circle: Circle = {
        id: `circle-${counter}`,
        name: input.name,
        color: input.color,
        role: 'owner',
        is_personal: false,
        open_task_count: 0,
      };
      circles.push(circle);
      members[circle.id] = [{ user_id: ME, display_name: 'Luke', role: 'owner' }];
      return circle;
    },
    async addTaskAttachment(input) {
      counter += 1;
      const record: AttachmentRecord = {
        id: `attachment-${counter}`,
        task_id: input.taskId,
        circle_id: input.spaceId,
        path: `${input.spaceId}/${input.taskId}/00000000-0000-4000-8000-${String(counter).padStart(12, '0')}.${input.extension}`,
        media_type: input.mediaType,
        content_type: input.contentType,
        byte_length: input.bytes.byteLength,
        created_at: new Date(Date.UTC(2026, 9, 3, 0, 0, counter)).toISOString(),
      };
      attachments.push(record);
      return record;
    },
  };

  return store;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function asBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function jpegBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function pngBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

function mp4Bytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.set([0x00, 0x00, 0x00, 0x18], 0);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  bytes.set([0x69, 0x73, 0x6f, 0x6d], 8); // isom
  return bytes;
}
