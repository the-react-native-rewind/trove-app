import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MCP_TOOL_NAMES,
  TroveError,
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
  assignTask,
  completeTask,
  createTask,
  createTasksBulk,
  getCircle,
  inviteToCircle,
  listCircles,
  listMyTasks,
  moveTask,
  planMove,
  updateTask,
} from './mcpTools';

const ME = 'user-me';
const SAM = 'user-sam';
const PERSONAL = 'circle-personal';
const HOUSE = 'circle-house';

test('the tool catalog matches the handlers we ship', () => {
  assert.deepEqual(MCP_TOOL_NAMES, [
    'list_circles',
    'get_circle',
    'list_my_tasks',
    'list_circle_tasks',
    'create_task',
    'create_tasks_bulk',
    'update_task',
    'complete_task',
    'assign_task',
    'move_task',
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
  assert.equal(invited.data.invite.url.startsWith('trove://invite/'), true);
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
  calls: { counts: number; plain: number };
  setRole: (circleId: string, role: Role) => void;
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
  const calls = { counts: 0, plain: 0 };
  let counter = 0;

  const store: TroveStore & {
    tasks: TaskRecord[];
    calls: { counts: number; plain: number };
    setRole: (circleId: string, role: Role) => void;
  } = {
    userId: ME,
    tasks,
    calls,
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
        due_date: input.dueDate,
        circle_id: input.circleId,
        circle_name: circle?.name ?? '',
        assignee_id: input.assigneeId,
        assignee_name: assignee?.display_name ?? null,
        tags: input.tags,
        external_id: input.externalId,
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
        url: 'trove://invite/invite-token',
      };
    },
  };

  return store;
}
