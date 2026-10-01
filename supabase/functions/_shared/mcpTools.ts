/**
 * Tool handlers for the Trove MCP server.
 *
 * Circles are rows in public.spaces. "Mine" is not a circle: it is every task
 * assigned to the signed-in person. The personal circle is their is_default space.
 *
 * move_task matches public.move_task in migration 0011: the caller must be able
 * to edit the source circle, must belong to the destination (a viewer may
 * receive a task), and an assignee who is not a member of the destination is
 * cleared. Tags that belong to the old circle are removed.
 */

export const BULK_LIMIT = 100;
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;

export const MCP_TOOL_NAMES = [
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
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolDescriptions: Record<McpToolName, string> = {
  list_circles:
    'List the circles the signed-in person belongs to. A circle is a shared place for tasks (a house, a side business, a personal list, a community). Each result includes the role, whether it is their private personal circle, and how many tasks are not done. "Mine" is not a circle; it is the cross-circle list of tasks assigned to you. Use list_my_tasks for that.',
  get_circle:
    'Get one circle by id or name, including the caller\'s role and the open-task count. Names match case-insensitively and must be unique among the caller\'s circles.',
  list_my_tasks:
    'List tasks assigned to the signed-in person across every circle they belong to (their Mine list). Optional filters: circle, status (todo, in_progress, done), and due date (due_on, due_before, due_after as YYYY-MM-DD). This is not limited to the personal circle.',
  list_circle_tasks:
    'List every task in one circle, not only tasks assigned to the caller. Viewers can read. Optional filters: status and due date.',
  create_task:
    'Create a task. Put it in a circle with circle_id or circle_name, or set personal to true for the private personal circle. If you name no circle, it goes in the personal circle and is assigned to the caller, which is how a new capture shows up on Mine. notes is the description. tags are label names in that circle (created if needed). assignee is a member id, a display name, "me", or null. external_id is an optional stable id from Notion, Trello, or another export; repeating it returns the existing task instead of creating a duplicate.',
  create_tasks_bulk:
    'Create up to 100 tasks in one call, for importing a list. Each item has the same fields as create_task. A circle set on the call is the default; an item can override it. external_id makes the import safe to retry: a task the caller already created with that id is returned as existing and is not changed. Items that fail are reported; earlier items in the batch are kept.',
  update_task:
    'Change a task\'s title, notes, status, priority, due date, assignee, or tags. Tags replace the current set. This does not move the task to another circle; use move_task for that. Only someone who can edit the circle (owner, admin, or member) can update. Viewers cannot.',
  complete_task: 'Mark a task done. Same permission as update_task.',
  assign_task:
    'Set or clear a task\'s assignee. assignee is a member id, a display name, "me", or null to unassign. The person must already be a member of the task\'s circle.',
  move_task:
    'Move a task from one circle to another, including from the personal circle into a shared circle. The caller must be able to edit the task where it is now, and must be a member of the destination (a viewer of the destination may still receive it). If the assignee is not a member of the destination, they are unassigned. Tags from the old circle are removed. Photos and videos stay in the original circle and are not moved. Pass circle_id, circle_name, or personal: true.',
  list_members:
    'List the people in a circle: user id, display name, and role (owner, admin, member, viewer). Email addresses are not included.',
  invite_to_circle:
    'Invite someone to a circle by email. Only an owner or admin can invite. role is admin, member, or viewer (default member). Returns the invite token and a trove:// link the person opens in the app. The invite expires in 14 days. One pending invite per email per circle.',
};

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';

export type Circle = {
  id: string;
  name: string;
  color: string;
  role: Role;
  is_personal: boolean;
  open_task_count: number;
};

export type Member = {
  user_id: string;
  display_name: string | null;
  role: Role;
};

export type TaskTag = { name: string; circle_id: string };

export type TaskRecord = {
  id: string;
  title: string;
  notes: string | null;
  status: Status;
  priority: Priority | null;
  due_date: string | null;
  circle_id: string;
  circle_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  tags: string[];
  external_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskFilter = {
  circleId?: string;
  assigneeId?: string;
  status?: Status;
  dueOn?: string;
  dueBefore?: string;
  dueAfter?: string;
  limit: number;
};

export type TaskWrite = {
  circleId: string;
  title: string;
  notes: string | null;
  status: Status;
  priority: Priority | null;
  dueDate: string | null;
  assigneeId: string | null;
  externalId: string | null;
  tags: string[];
  position: number;
};

export type TaskPatch = {
  title?: string;
  notes?: string | null;
  status?: Status;
  priority?: Priority | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  tags?: string[];
};

export type MoveResult = {
  task_id: string;
  source_circle_id: string;
  target_circle_id: string;
  assignee_cleared: boolean;
  already_there: boolean;
  tags_removed: number;
  task: TaskRecord;
};

export type InviteResult = {
  id: string;
  circle_id: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  token: string;
  expires_at: string;
  url: string;
};

export interface TroveStore {
  userId: string;
  /**
   * Circles the caller belongs to. Open-task counts are a separate aggregate
   * and are loaded only when includeOpenCounts is set, so create/update/move
   * do not count tasks on every call.
   */
  listCircles(options?: { includeOpenCounts?: boolean }): Promise<Circle[]>;
  listMembers(circleId: string): Promise<Member[]>;
  listTasks(filter: TaskFilter): Promise<TaskRecord[]>;
  getTask(id: string): Promise<TaskRecord | null>;
  findByExternalId(externalId: string): Promise<TaskRecord | null>;
  insertTask(input: TaskWrite): Promise<TaskRecord>;
  updateTask(id: string, patch: TaskPatch): Promise<TaskRecord | null>;
  /**
   * Apply a move that the handler has already authorised. The database
   * function public.move_task enforces the same rules again.
   */
  moveTask(taskId: string, targetCircleId: string): Promise<MoveResult>;
  createInvite(input: {
    circleId: string;
    email: string;
    role: 'admin' | 'member' | 'viewer';
  }): Promise<InviteResult>;
}

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: string };

export class TroveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TroveError';
  }
}

export function canWrite(role: Role | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

export function canManage(role: Role | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDueDate(value: string): string | null {
  const match = DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export type CircleTarget = {
  circle_id?: string;
  circle_name?: string;
  personal?: boolean;
};

export function resolveCircle(
  circles: Circle[],
  target: CircleTarget,
  mode: 'required' | 'default-personal',
): Circle | { error: string } {
  const hasId = Boolean(target.circle_id);
  const hasName = Boolean(target.circle_name?.trim());
  const personal = target.personal === true;
  const specified = Number(hasId) + Number(hasName) + Number(personal);

  if (specified > 1) {
    return { error: 'Pass one of circle_id, circle_name, or personal, not more than one.' };
  }

  if (specified === 0) {
    if (mode === 'default-personal') return personalCircle(circles);
    return { error: 'Name a circle with circle_id or circle_name, or set personal to true.' };
  }

  if (personal) return personalCircle(circles);

  if (hasId) {
    const found = circles.find((circle) => circle.id === target.circle_id);
    if (!found) return { error: 'Circle not found' };
    return found;
  }

  const name = target.circle_name?.trim() ?? '';
  if (name.toLowerCase() === 'mine') {
    return {
      error:
        '"Mine" is the list of tasks assigned to you, not a circle. Use list_my_tasks, or set personal to true for the private personal circle.',
    };
  }
  const matches = circles.filter((circle) => circle.name.toLowerCase() === name.toLowerCase());
  if (matches.length === 0) return { error: `No circle named "${name}".` };
  if (matches.length > 1) {
    return {
      error: `More than one circle is named "${name}". Pass circle_id. Choices: ${matches.map((circle) => circle.id).join(', ')}.`,
    };
  }
  return matches[0] ?? { error: `No circle named "${name}".` };
}

function personalCircle(circles: Circle[]): Circle | { error: string } {
  const owned = circles.find((circle) => circle.is_personal && circle.role === 'owner');
  const fallback = circles.find((circle) => circle.is_personal);
  const circle = owned ?? fallback;
  if (!circle) return { error: 'No personal circle found for this account.' };
  return circle;
}

export function clampLimit(limit: number | undefined): number | { error: string } {
  if (limit === undefined) return LIST_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_MAX_LIMIT) {
    return { error: `limit must be an integer from 1 to ${LIST_MAX_LIMIT}.` };
  }
  return limit;
}

type MovePlan =
  | {
      ok: true;
      alreadyThere: boolean;
      assigneeCleared: boolean;
      tagsRemoved: number;
      nextAssigneeId: string | null;
    }
  | { ok: false; error: string };

/**
 * The same decisions as public.move_task. Tags carry the circle they belong
 * to; ones from anywhere but the destination are removed.
 */
export function planMove(input: {
  callerSourceRole: Role | null;
  callerIsTargetMember: boolean;
  targetExists: boolean;
  sourceCircleId: string;
  targetCircleId: string;
  assigneeId: string | null;
  targetMemberIds: string[];
  tags: TaskTag[];
}): MovePlan {
  if (input.callerSourceRole === null) return { ok: false, error: 'Task not found' };
  if (!canWrite(input.callerSourceRole)) {
    return { ok: false, error: 'You cannot edit tasks in this circle' };
  }
  if (!input.targetExists || !input.callerIsTargetMember) {
    return { ok: false, error: 'Circle not found' };
  }
  if (input.sourceCircleId === input.targetCircleId) {
    return { ok: true, alreadyThere: true, assigneeCleared: false, tagsRemoved: 0, nextAssigneeId: input.assigneeId };
  }
  const assigneeCleared =
    input.assigneeId !== null && !input.targetMemberIds.includes(input.assigneeId);
  const tagsRemoved = input.tags.filter((tag) => tag.circle_id !== input.targetCircleId).length;
  return {
    ok: true,
    alreadyThere: false,
    assigneeCleared,
    tagsRemoved,
    nextAssigneeId: assigneeCleared ? null : input.assigneeId,
  };
}

export async function listCircles(store: TroveStore): Promise<ToolResult<{ circles: Circle[] }>> {
  try {
    return { ok: true, data: { circles: await store.listCircles({ includeOpenCounts: true }) } };
  } catch (error) {
    return fail(error);
  }
}

export async function getCircle(
  store: TroveStore,
  input: CircleTarget,
): Promise<ToolResult<{ circle: Circle }>> {
  try {
    const circles = await store.listCircles({ includeOpenCounts: true });
    const circle = resolveCircle(circles, input, 'required');
    if ('error' in circle) return { ok: false, error: circle.error };
    return { ok: true, data: { circle } };
  } catch (error) {
    return fail(error);
  }
}

export async function listMyTasks(
  store: TroveStore,
  input: ListInput,
): Promise<ToolResult<{ tasks: TaskRecord[] }>> {
  return listFiltered(store, input, { assigneeId: store.userId, circleOptional: true });
}

export async function listCircleTasks(
  store: TroveStore,
  input: ListInput & CircleTarget,
): Promise<ToolResult<{ tasks: TaskRecord[] }>> {
  return listFiltered(store, input, { assigneeId: undefined, circleOptional: false });
}

type ListInput = {
  circle_id?: string;
  circle_name?: string;
  personal?: boolean;
  status?: Status;
  due_on?: string;
  due_before?: string;
  due_after?: string;
  limit?: number;
};

async function listFiltered(
  store: TroveStore,
  input: ListInput,
  options: { assigneeId: string | undefined; circleOptional: boolean },
): Promise<ToolResult<{ tasks: TaskRecord[] }>> {
  try {
    const limit = clampLimit(input.limit);
    if (typeof limit !== 'number') return { ok: false, error: limit.error };
    const due = readDueFilters(input);
    if ('error' in due) return { ok: false, error: due.error };
    if (input.status && !isStatus(input.status)) return { ok: false, error: 'Unknown status.' };

    let circleId: string | undefined;
    const wantsCircle = Boolean(input.circle_id || input.circle_name || input.personal);
    if (wantsCircle || !options.circleOptional) {
      const circles = await store.listCircles();
      const circle = resolveCircle(circles, input, options.circleOptional ? 'required' : 'required');
      if ('error' in circle) return { ok: false, error: circle.error };
      circleId = circle.id;
    }

    const tasks = await store.listTasks({
      circleId,
      assigneeId: options.assigneeId,
      status: input.status,
      dueOn: due.dueOn,
      dueBefore: due.dueBefore,
      dueAfter: due.dueAfter,
      limit,
    });
    return { ok: true, data: { tasks } };
  } catch (error) {
    return fail(error);
  }
}

export type CreateTaskInput = {
  title: string;
  notes?: string | null;
  circle_id?: string;
  circle_name?: string;
  personal?: boolean;
  assignee?: string | null;
  due_date?: string | null;
  tags?: string[];
  status?: Status;
  priority?: Priority | null;
  external_id?: string | null;
};

export async function createTask(
  store: TroveStore,
  input: CreateTaskInput,
): Promise<ToolResult<{ task: TaskRecord; existing: boolean }>> {
  try {
    const prepared = await prepareCreate(store, input);
    if (!prepared.ok) return prepared;
    if (prepared.existing) return { ok: true, data: { task: prepared.existing, existing: true } };
    const task = await store.insertTask(prepared.write);
    return { ok: true, data: { task, existing: false } };
  } catch (error) {
    return fail(error);
  }
}

export async function createTasksBulk(
  store: TroveStore,
  input: { tasks: CreateTaskInput[]; circle_id?: string; circle_name?: string; personal?: boolean },
): Promise<
  ToolResult<{
    created: TaskRecord[];
    existing: TaskRecord[];
    failed: { index: number; title: string; error: string }[];
  }>
> {
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    return { ok: false, error: 'tasks must be a non-empty array.' };
  }
  if (input.tasks.length > BULK_LIMIT) {
    return { ok: false, error: `Create at most ${BULK_LIMIT} tasks per call. Split the import.` };
  }

  const created: TaskRecord[] = [];
  const existing: TaskRecord[] = [];
  const failed: { index: number; title: string; error: string }[] = [];

  for (let index = 0; index < input.tasks.length; index += 1) {
    const item = input.tasks[index] ?? { title: '' };
    const itemNamesCircle = Boolean(item.circle_id || item.circle_name || item.personal);
    const merged: CreateTaskInput = itemNamesCircle
      ? item
      : {
          ...item,
          circle_id: input.circle_id,
          circle_name: input.circle_name,
          personal: input.personal,
        };
    try {
      const prepared = await prepareCreate(store, merged);
      if (!prepared.ok) {
        failed.push({ index, title: item.title ?? '', error: prepared.error });
        continue;
      }
      if (prepared.existing) {
        existing.push(prepared.existing);
        continue;
      }
      created.push(await store.insertTask(prepared.write));
    } catch (error) {
      failed.push({ index, title: item.title ?? '', error: messageOf(error) });
    }
  }

  return { ok: true, data: { created, existing, failed } };
}

export async function updateTask(
  store: TroveStore,
  input: {
    task_id: string;
    title?: string;
    notes?: string | null;
    status?: Status;
    priority?: Priority | null;
    due_date?: string | null;
    assignee?: string | null;
    tags?: string[];
  },
): Promise<ToolResult<{ task: TaskRecord }>> {
  try {
    const task = await requireWritableTask(store, input.task_id);
    if (!task.ok) return task;
    const patch = await buildPatch(store, task.task, input);
    if (!patch.ok) return patch;
    const updated = await store.updateTask(task.task.id, patch.patch);
    if (!updated) return { ok: false, error: 'Task not found' };
    return { ok: true, data: { task: updated } };
  } catch (error) {
    return fail(error);
  }
}

export async function completeTask(
  store: TroveStore,
  input: { task_id: string },
): Promise<ToolResult<{ task: TaskRecord }>> {
  return updateTask(store, { task_id: input.task_id, status: 'done' });
}

export async function assignTask(
  store: TroveStore,
  input: { task_id: string; assignee: string | null },
): Promise<ToolResult<{ task: TaskRecord }>> {
  return updateTask(store, { task_id: input.task_id, assignee: input.assignee });
}

export async function moveTask(
  store: TroveStore,
  input: { task_id: string } & CircleTarget,
): Promise<ToolResult<MoveResult>> {
  try {
    const task = await store.getTask(input.task_id);
    if (!task) return { ok: false, error: 'Task not found' };
    const circles = await store.listCircles();
    const source = circles.find((circle) => circle.id === task.circle_id);
    const target = resolveCircle(circles, input, 'required');
    if ('error' in target) return { ok: false, error: target.error };
    const members = await store.listMembers(target.id);
    const plan = planMove({
      callerSourceRole: source?.role ?? null,
      callerIsTargetMember: true,
      targetExists: true,
      sourceCircleId: task.circle_id,
      targetCircleId: target.id,
      assigneeId: task.assignee_id,
      targetMemberIds: members.map((member) => member.user_id),
      tags: task.tags.map((name) => ({ name, circle_id: task.circle_id })),
    });
    if (!plan.ok) return { ok: false, error: plan.error };
    if (plan.alreadyThere) {
      return {
        ok: true,
        data: {
          task_id: task.id,
          source_circle_id: task.circle_id,
          target_circle_id: target.id,
          assignee_cleared: false,
          already_there: true,
          tags_removed: 0,
          task,
        },
      };
    }
    return { ok: true, data: await store.moveTask(task.id, target.id) };
  } catch (error) {
    return fail(error);
  }
}

export async function listMembers(
  store: TroveStore,
  input: CircleTarget,
): Promise<ToolResult<{ members: Member[] }>> {
  try {
    const circles = await store.listCircles();
    const circle = resolveCircle(circles, input, 'required');
    if ('error' in circle) return { ok: false, error: circle.error };
    const members = await store.listMembers(circle.id);
    return { ok: true, data: { members } };
  } catch (error) {
    return fail(error);
  }
}

export async function inviteToCircle(
  store: TroveStore,
  input: CircleTarget & { email: string; role?: 'admin' | 'member' | 'viewer' | 'owner' },
): Promise<ToolResult<{ invite: InviteResult }>> {
  try {
    const circles = await store.listCircles();
    const circle = resolveCircle(circles, input, 'required');
    if ('error' in circle) return { ok: false, error: circle.error };
    if (!canManage(circle.role)) {
      return { ok: false, error: 'Only an owner or admin can invite someone to this circle.' };
    }
    const email = input.email?.trim().toLowerCase() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    if (input.role === 'owner') {
      return { ok: false, error: 'The owner role cannot be invited. Choose admin, member, or viewer.' };
    }
    const role = input.role ?? 'member';
    if (role !== 'admin' && role !== 'member' && role !== 'viewer') {
      return { ok: false, error: 'role must be admin, member, or viewer.' };
    }
    const invite = await store.createInvite({ circleId: circle.id, email, role });
    return { ok: true, data: { invite } };
  } catch (error) {
    return fail(error);
  }
}

type Prepared =
  | { ok: true; existing: TaskRecord | null; write: TaskWrite }
  | { ok: false; error: string };

async function prepareCreate(store: TroveStore, input: CreateTaskInput): Promise<Prepared> {
  const title = validateTitle(input.title);
  if (isFieldError(title)) return { ok: false, error: title.error };
  const notes = validateNotes(input.notes);
  if (isFieldError(notes)) return { ok: false, error: notes.error };
  const due = validateOptionalDate(input.due_date);
  if (isFieldError(due)) return { ok: false, error: due.error };
  const tags = validateTags(input.tags);
  if (isFieldError(tags)) return { ok: false, error: tags.error };
  const externalId = validateExternalId(input.external_id);
  if (isFieldError(externalId)) return { ok: false, error: externalId.error };
  if (input.status && !isStatus(input.status)) return { ok: false, error: 'Unknown status.' };
  if (input.priority && !isPriority(input.priority)) return { ok: false, error: 'Unknown priority.' };

  if (externalId) {
    const existing = await store.findByExternalId(externalId);
    if (existing) return { ok: true, existing, write: unusedWrite() };
  }

  const circles = await store.listCircles();
  const circle = resolveCircle(circles, input, 'default-personal');
  if ('error' in circle) return { ok: false, error: circle.error };
  if (!canWrite(circle.role)) {
    return { ok: false, error: 'You cannot edit tasks in this circle' };
  }

  const members = await store.listMembers(circle.id);
  const assignee = await resolveAssignee(store.userId, members, input.assignee, true);
  if ('error' in assignee) return { ok: false, error: assignee.error };

  return {
    ok: true,
    existing: null,
    write: {
      circleId: circle.id,
      title,
      notes,
      status: input.status ?? 'todo',
      priority: input.priority ?? null,
      dueDate: due,
      assigneeId: assignee.id,
      externalId,
      tags,
      position: Date.now(),
    },
  };
}

function unusedWrite(): TaskWrite {
  return {
    circleId: '',
    title: '',
    notes: null,
    status: 'todo',
    priority: null,
    dueDate: null,
    assigneeId: null,
    externalId: null,
    tags: [],
    position: 0,
  };
}

async function requireWritableTask(
  store: TroveStore,
  taskId: string,
): Promise<{ ok: true; task: TaskRecord } | { ok: false; error: string }> {
  const task = await store.getTask(taskId);
  if (!task) return { ok: false, error: 'Task not found' };
  const circles = await store.listCircles();
  const circle = circles.find((item) => item.id === task.circle_id);
  if (!circle) return { ok: false, error: 'Task not found' };
  if (!canWrite(circle.role)) return { ok: false, error: 'You cannot edit tasks in this circle' };
  return { ok: true, task };
}

async function buildPatch(
  store: TroveStore,
  task: TaskRecord,
  input: {
    title?: string;
    notes?: string | null;
    status?: Status;
    priority?: Priority | null;
    due_date?: string | null;
    assignee?: string | null;
    tags?: string[];
  },
): Promise<{ ok: true; patch: TaskPatch } | { ok: false; error: string }> {
  const patch: TaskPatch = {};
  if (input.title !== undefined) {
    const title = validateTitle(input.title);
    if (typeof title !== 'string') return { ok: false, error: title.error };
    patch.title = title;
  }
  if (input.notes !== undefined) {
    const notes = validateNotes(input.notes);
    if (isFieldError(notes)) return { ok: false, error: notes.error };
    patch.notes = notes;
  }
  if (input.status !== undefined) {
    if (!isStatus(input.status)) return { ok: false, error: 'Unknown status.' };
    patch.status = input.status;
  }
  if (input.priority !== undefined) {
    if (input.priority !== null && !isPriority(input.priority)) {
      return { ok: false, error: 'Unknown priority.' };
    }
    patch.priority = input.priority;
  }
  if (input.due_date !== undefined) {
    const due = validateOptionalDate(input.due_date);
    if (isFieldError(due)) return { ok: false, error: due.error };
    patch.dueDate = due;
  }
  if (input.assignee !== undefined) {
    const members = await store.listMembers(task.circle_id);
    const assignee = await resolveAssignee(store.userId, members, input.assignee, false);
    if ('error' in assignee) return { ok: false, error: assignee.error };
    patch.assigneeId = assignee.id;
  }
  if (input.tags !== undefined) {
    const tags = validateTags(input.tags);
    if (isFieldError(tags)) return { ok: false, error: tags.error };
    patch.tags = tags;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'Nothing to update. Pass at least one field.' };
  }
  return { ok: true, patch };
}

async function resolveAssignee(
  callerId: string,
  members: Member[],
  assignee: string | null | undefined,
  defaultToSelf: boolean,
): Promise<{ id: string | null } | { error: string }> {
  if (assignee === undefined) {
    if (!defaultToSelf) return { id: null };
    if (!members.some((member) => member.user_id === callerId)) {
      return { error: 'You are not a member of this circle, so the task cannot be assigned to you.' };
    }
    return { id: callerId };
  }
  if (assignee === null || assignee.trim() === '' || assignee.trim().toLowerCase() === 'unassigned') {
    return { id: null };
  }
  const needle = assignee.trim();
  if (needle.toLowerCase() === 'me') {
    if (!members.some((member) => member.user_id === callerId)) {
      return { error: 'You are not a member of this circle.' };
    }
    return { id: callerId };
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(needle)) {
    if (!members.some((member) => member.user_id === needle)) {
      return { error: 'That person is not a member of this circle.' };
    }
    return { id: needle };
  }
  const matches = members.filter(
    (member) => (member.display_name ?? '').toLowerCase() === needle.toLowerCase(),
  );
  if (matches.length === 1 && matches[0]) return { id: matches[0].user_id };
  if (matches.length > 1) return { error: `More than one member is named "${needle}". Pass their user id.` };
  return {
    error: `No member named "${needle}" in this circle. Members: ${memberNames(members)}.`,
  };
}

function memberNames(members: Member[]): string {
  const names = members.map((member) => member.display_name).filter((name): name is string => Boolean(name));
  return names.length ? names.join(', ') : 'none listed';
}

function isFieldError(value: unknown): value is { error: string } {
  return typeof value === 'object' && value !== null && 'error' in value;
}

function validateTitle(title: string | undefined): string | { error: string } {
  const trimmed = title?.trim() ?? '';
  if (!trimmed) return { error: 'A task needs a title.' };
  if (trimmed.length > 300) return { error: 'Title must be 300 characters or fewer.' };
  return trimmed;
}

function validateNotes(notes: string | null | undefined): string | null | { error: string } {
  if (notes === undefined || notes === null) return null;
  const trimmed = notes.trim();
  if (trimmed.length > 8000) return { error: 'Notes must be 8000 characters or fewer.' };
  return trimmed || null;
}

function validateOptionalDate(value: string | null | undefined): string | null | { error: string } {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseDueDate(value);
  if (!parsed) return { error: 'due_date must be a real date as YYYY-MM-DD.' };
  return parsed;
}

function validateTags(tags: string[] | undefined): string[] | { error: string } {
  if (!tags) return [];
  if (tags.length > 20) return { error: 'A task can have at most 20 tags.' };
  const cleaned: string[] = [];
  for (const tag of tags) {
    const name = tag.trim();
    if (!name) continue;
    if (name.length > 40) return { error: 'Each tag must be 40 characters or fewer.' };
    if (!cleaned.some((existing) => existing.toLowerCase() === name.toLowerCase())) cleaned.push(name);
  }
  return cleaned;
}

function validateExternalId(value: string | null | undefined): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 200) return { error: 'external_id must be 200 characters or fewer.' };
  return trimmed;
}

function readDueFilters(input: {
  due_on?: string;
  due_before?: string;
  due_after?: string;
}): { dueOn?: string; dueBefore?: string; dueAfter?: string } | { error: string } {
  const dueOn = input.due_on ? parseDueDate(input.due_on) : undefined;
  const dueBefore = input.due_before ? parseDueDate(input.due_before) : undefined;
  const dueAfter = input.due_after ? parseDueDate(input.due_after) : undefined;
  if (input.due_on && !dueOn) return { error: 'due_on must be a real date as YYYY-MM-DD.' };
  if (input.due_before && !dueBefore) return { error: 'due_before must be a real date as YYYY-MM-DD.' };
  if (input.due_after && !dueAfter) return { error: 'due_after must be a real date as YYYY-MM-DD.' };
  return { dueOn: dueOn ?? undefined, dueBefore: dueBefore ?? undefined, dueAfter: dueAfter ?? undefined };
}

function isStatus(value: string): value is Status {
  return value === 'todo' || value === 'in_progress' || value === 'done';
}

function isPriority(value: string): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

function fail(error: unknown): ToolResult<never> {
  return { ok: false, error: messageOf(error) };
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong.';
}
