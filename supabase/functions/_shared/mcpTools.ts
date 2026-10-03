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
 *
 * create_circle matches the app: insert a spaces row owned by the caller.
 * The on_space_created trigger adds the owner membership. Circles have a name
 * and an accent colour. They do not have an emoji or a description.
 *
 * add_task_attachment matches src/data/attachments.ts: bytes go in the private
 * task-media bucket at {space_id}/{task_id}/{uuid}.{ext}, then a
 * task_attachments row. The caller must be able to edit the task. The store
 * uses the caller's JWT so storage and table RLS still apply.
 *
 * Repeat rules match public.tasks_normalize_repeat in migration 0014.
 * repeat_unit is day, week, month, or null. repeat_interval is 1–99.
 * repeat_weekday is 0 (Sunday) through 6 (Saturday) and is stored only for
 * week. null or "never" clears the rule. The first occurrence's
 * recurrence_series_id is its own id. recurrence_source_id stays server-only
 * and is never returned. Completing a repeating task is still just status
 * done: the database trigger inserts the next occurrence.
 */

export const BULK_LIMIT = 100;
export const LIST_DEFAULT_LIMIT = 50;
export const LIST_MAX_LIMIT = 200;

/** Accent names from src/theme/tokens.ts spaceAccentOrder. The web picker also stores #rrggbb. */
export const CIRCLE_COLORS = [
  'sage',
  'brand',
  'moss',
  'teal',
  'dusk',
  'lilac',
  'plum',
  'rose',
  'terracotta',
  'clay',
  'ochre',
  'honey',
] as const;

export const CIRCLE_NAME_MAX = 80;
export const DEFAULT_CIRCLE_COLOR = 'sage';

/** Matches storage.buckets.file_size_limit for task-media in migration 0008. */
export const TASK_MEDIA_MAX_BYTES = 52_428_800;

export const TASK_MEDIA_TYPES = {
  'image/jpeg': { mediaType: 'image', extensions: ['jpg', 'jpeg'] },
  'image/png': { mediaType: 'image', extensions: ['png'] },
  'image/webp': { mediaType: 'image', extensions: ['webp'] },
  'image/gif': { mediaType: 'image', extensions: ['gif'] },
  'image/heic': { mediaType: 'image', extensions: ['heic'] },
  'image/heif': { mediaType: 'image', extensions: ['heif'] },
  'video/mp4': { mediaType: 'video', extensions: ['mp4'] },
  'video/quicktime': { mediaType: 'video', extensions: ['mov'] },
  'video/webm': { mediaType: 'video', extensions: ['webm'] },
} as const;

export type TaskMediaContentType = keyof typeof TASK_MEDIA_TYPES;

export const MCP_TOOL_NAMES = [
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
] as const;

export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const toolDescriptions: Record<McpToolName, string> = {
  list_circles:
    'List the circles the signed-in person belongs to. A circle is a shared place for tasks (a house, a side business, a personal list, a community). Each result includes the role, whether it is their private personal circle, and how many tasks are not done. "Mine" is not a circle; it is the cross-circle list of tasks assigned to you. Use list_my_tasks for that.',
  get_circle:
    'Get one circle by id or name, including the caller\'s role and the open-task count. Names match case-insensitively and must be unique among the caller\'s circles.',
  create_circle:
    'Create a circle owned by the signed-in person. name is required (for example Home or Garden). color is an optional accent: sage, brand, moss, teal, dusk, lilac, plum, rose, terracotta, clay, ochre, honey, or a #rrggbb hex. It defaults to sage. Circles do not have an emoji or a description. The creator becomes the owner, the same way creating a circle in the app does. This does not create a second personal circle. Returns the circle, including its id.',
  list_my_tasks:
    'List tasks assigned to the signed-in person across every circle they belong to (their Mine list). Optional filters: circle, status (todo, in_progress, done), and due date (due_on, due_before, due_after as YYYY-MM-DD). This is not limited to the personal circle. Results are ordered by due date (earliest first, no date last), then rank (higher first). Each task includes rank, repeat_unit, repeat_interval, repeat_weekday, and recurrence_series_id. recurrence_source_id is not returned. rank is the fractional ordering key shared with the circle.',
  list_circle_tasks:
    'List every task in one circle, not only tasks assigned to the caller. Viewers can read. Optional filters: status and due date. Results are ordered by due date (earliest first, no date last), then rank (higher first). Each task includes rank, repeat_unit, repeat_interval, repeat_weekday, and recurrence_series_id. recurrence_source_id is not returned.',
  create_task:
    'Create a task. Put it in a circle with circle_id or circle_name, or set personal to true for the private personal circle. If you name no circle, it goes in the personal circle and is assigned to the caller, which is how a new capture shows up on Mine. notes is the description. tags are label names in that circle (created if needed). assignee is a member id, a display name, "me", or null. priority is low, medium, high, or null and chooses a starting rank in that due-date group: high above the current top, medium in the middle, low or null at the bottom. external_id is an optional stable id from Notion, Trello, or another export; repeating it returns the existing task instead of creating a duplicate. Optional repeat_unit is day, week, month, never, or null. repeat_interval is 1 to 99 (default 1). repeat_weekday is 0 (Sunday) through 6 (Saturday) and is only stored for week. Omit the repeat fields and the task does not repeat.',
  create_tasks_bulk:
    'Create up to 100 tasks in one call, for importing a list. Each item has the same fields as create_task, including the optional repeat fields. A circle set on the call is the default; an item can override it. external_id makes the import safe to retry: a task the caller already created with that id is returned as existing and is not changed. Items that fail are reported; earlier items in the batch are kept.',
  update_task:
    'Change a task\'s title, notes, status, priority, due date, assignee, tags, or repeat rule. priority is low, medium, high, or null and sets rank inside the task\'s due-date group: high above the current top, medium in the middle, low or null at the bottom. Changing the due date without priority places the task at the bottom of the new group. Tags replace the current set. repeat_unit null or never clears the repeat rule. repeat_interval is 1 to 99. repeat_weekday is 0 (Sunday) through 6 (Saturday) and is only used for week. This does not move the task to another circle; use move_task for that. Only someone who can edit the circle (owner, admin, or member) can update. Viewers cannot. Setting status to done on a repeating task leaves this row done; the database inserts the next occurrence at the bottom of its due-date group.',
  complete_task:
    'Mark a task done. Same permission as update_task. If the task repeats, the database inserts the next To do occurrence with the same rule. This result is the completed row, including its repeat fields and recurrence_series_id. recurrence_source_id is not returned.',
  assign_task:
    'Set or clear a task\'s assignee. assignee is a member id, a display name, "me", or null to unassign. The person must already be a member of the task\'s circle.',
  move_task:
    'Move a task from one circle to another, including from the personal circle into a shared circle. The caller must be able to edit the task where it is now, and must be a member of the destination (a viewer of the destination may still receive it). If the assignee is not a member of the destination, they are unassigned. Tags from the old circle are removed. Photos and videos stay in the original circle and are not moved. Pass circle_id, circle_name, or personal: true.',
  add_task_attachment:
    'Attach an image or video to a task the caller can edit (owner, admin, or member). Viewers cannot. Pass task_id, content_type, and either a public https url (the server downloads it) or data_base64. Allowed types: image/jpeg, image/png, image/webp, image/gif, image/heic, image/heif, video/mp4, video/quicktime, video/webm. Maximum 50 MB. The file is stored like a photo added in the app, under the task\'s circle, and shows in the task media gallery. Several attachments per task are kept in the order they were added. Returns the attachment id.',
  list_members:
    'List the people in a circle: user id, display name, and role (owner, admin, member, viewer). Email addresses are not included.',
  invite_to_circle:
    'Invite someone to a circle by email. Only an owner or admin can invite. role is admin, member, or viewer (default member). Returns the invite token and a trove:// link the person opens in the app. The invite expires in 14 days. One pending invite per email per circle.',
};

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type Status = 'todo' | 'in_progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type RepeatUnit = 'day' | 'week' | 'month';

export type RepeatFields = {
  repeat_unit: RepeatUnit | null;
  repeat_interval: number;
  repeat_weekday: number | null;
};

export const EMPTY_REPEAT: RepeatFields = {
  repeat_unit: null,
  repeat_interval: 1,
  repeat_weekday: null,
};

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
  /** Fractional index. Larger keys sort first within a due date. */
  rank: string;
  due_date: string | null;
  circle_id: string;
  circle_name: string;
  assignee_id: string | null;
  assignee_name: string | null;
  tags: string[];
  external_id: string | null;
  repeat_unit: RepeatUnit | null;
  repeat_interval: number;
  repeat_weekday: number | null;
  recurrence_series_id: string | null;
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
  repeatUnit: RepeatUnit | null;
  repeatInterval: number;
  repeatWeekday: number | null;
};

export type TaskPatch = {
  title?: string;
  notes?: string | null;
  status?: Status;
  priority?: Priority | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  tags?: string[];
  repeatUnit?: RepeatUnit | null;
  repeatInterval?: number;
  repeatWeekday?: number | null;
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

export type CircleCreate = {
  name: string;
  color: string;
};

export type MediaType = 'image' | 'video';

export type AttachmentWrite = {
  taskId: string;
  spaceId: string;
  bytes: Uint8Array;
  contentType: TaskMediaContentType;
  mediaType: MediaType;
  extension: string;
};

export type AttachmentRecord = {
  id: string;
  task_id: string;
  circle_id: string;
  path: string;
  media_type: MediaType;
  content_type: TaskMediaContentType;
  byte_length: number;
  created_at: string;
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
  /**
   * Insert a spaces row the way the app does. The database trigger adds the
   * caller as owner. is_default stays false.
   */
  createCircle(input: CircleCreate): Promise<Circle>;
  /**
   * Upload bytes to task-media and insert task_attachments. The handler has
   * already checked that the caller can edit the task. The implementation
   * must use the caller's credentials, not the service role.
   */
  addTaskAttachment(input: AttachmentWrite): Promise<AttachmentRecord>;
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
  repeat_unit?: string | null;
  repeat_interval?: number | null;
  repeat_weekday?: number | null;
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
    repeat_unit?: string | null;
    repeat_interval?: number | null;
    repeat_weekday?: number | null;
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

export async function createCircle(
  store: TroveStore,
  input: { name?: string; color?: string | null },
): Promise<ToolResult<{ circle: Circle }>> {
  try {
    const name = validateCircleName(input.name);
    if (isFieldError(name)) return { ok: false, error: name.error };
    const color = normalizeCircleColor(input.color);
    if (isFieldError(color)) return { ok: false, error: color.error };
    const circle = await store.createCircle({ name, color });
    return { ok: true, data: { circle } };
  } catch (error) {
    return fail(error);
  }
}

export type AddAttachmentInput = {
  task_id: string;
  url?: string;
  data_base64?: string;
  content_type?: string;
  filename?: string;
};

export type AttachmentDeps = {
  fetch?: typeof fetch;
  resolveDns?: (hostname: string) => Promise<string[]>;
};

export async function addTaskAttachment(
  store: TroveStore,
  input: AddAttachmentInput,
  deps?: AttachmentDeps,
): Promise<ToolResult<{ attachment: AttachmentRecord }>> {
  try {
    const contentType = normalizeContentType(input.content_type);
    if (isFieldError(contentType)) return { ok: false, error: contentType.error };
    const source = readAttachmentSource(input);
    if (isFieldError(source)) return { ok: false, error: source.error };

    const task = await requireWritableTask(store, input.task_id);
    if (!task.ok) return task;

    const loaded = await loadAttachmentBytes(source, contentType, deps);
    if (isFieldError(loaded)) return { ok: false, error: loaded.error };

    const attachment = await store.addTaskAttachment({
      taskId: task.task.id,
      spaceId: task.task.circle_id,
      bytes: loaded.bytes,
      contentType,
      mediaType: TASK_MEDIA_TYPES[contentType].mediaType,
      extension: chooseExtension(input.filename, contentType),
    });
    return { ok: true, data: { attachment } };
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

  const repeat = resolveRepeat({
    input,
    current: EMPTY_REPEAT,
    dueDate: due,
    todayUtc: utcDateString(),
    mode: 'create',
  });
  if (!repeat || isFieldError(repeat)) {
    return { ok: false, error: repeat && 'error' in repeat ? repeat.error : 'Repeat rule is not valid.' };
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
      repeatUnit: repeat.repeat_unit,
      repeatInterval: repeat.repeat_interval,
      repeatWeekday: repeat.repeat_weekday,
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
    repeatUnit: null,
    repeatInterval: 1,
    repeatWeekday: null,
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
    repeat_unit?: string | null;
    repeat_interval?: number | null;
    repeat_weekday?: number | null;
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
  const repeat = resolveRepeat({
    input,
    current: {
      repeat_unit: task.repeat_unit,
      repeat_interval: task.repeat_interval,
      repeat_weekday: task.repeat_weekday,
    },
    dueDate: patch.dueDate !== undefined ? patch.dueDate : task.due_date,
    todayUtc: utcDateString(),
    mode: 'update',
  });
  if (isFieldError(repeat)) return { ok: false, error: repeat.error };
  if (repeat) {
    patch.repeatUnit = repeat.repeat_unit;
    patch.repeatInterval = repeat.repeat_interval;
    patch.repeatWeekday = repeat.repeat_weekday;
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

export function utcDateString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. Null when the value is not a real YYYY-MM-DD date. */
export function weekdayOfDate(iso: string): number | null {
  const parsed = parseDueDate(iso);
  if (!parsed) return null;
  const [year, month, day] = parsed.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

export type RepeatInput = {
  repeat_unit?: string | null;
  repeat_interval?: number | null;
  repeat_weekday?: number | null;
};

/**
 * The same shape as public.tasks_normalize_repeat. Update with no repeat
 * fields returns undefined. Create with no repeat fields returns an empty rule.
 * null and "never" clear it. A week with no weekday uses the due date, then
 * today (UTC). Day and month do not keep a weekday.
 */
export function resolveRepeat(args: {
  input: RepeatInput;
  current: RepeatFields;
  dueDate: string | null;
  todayUtc: string;
  mode: 'create' | 'update';
}): RepeatFields | { error: string } | undefined {
  const unitGiven = args.input.repeat_unit !== undefined;
  const intervalGiven = args.input.repeat_interval !== undefined;
  const weekdayGiven = args.input.repeat_weekday !== undefined;
  if (!unitGiven && !intervalGiven && !weekdayGiven) {
    return args.mode === 'create' ? { ...EMPTY_REPEAT } : undefined;
  }

  const parsedUnit = unitGiven ? parseRepeatUnit(args.input.repeat_unit) : args.current.repeat_unit;
  if (isFieldError(parsedUnit)) return parsedUnit;
  const parsedInterval = intervalGiven ? parseRepeatInterval(args.input.repeat_interval) : args.current.repeat_interval;
  if (isFieldError(parsedInterval)) return parsedInterval;
  const parsedWeekday = weekdayGiven ? parseRepeatWeekday(args.input.repeat_weekday) : undefined;
  if (isFieldError(parsedWeekday)) return parsedWeekday;

  if (parsedUnit === 'clear') {
    if (intervalGiven || (weekdayGiven && args.input.repeat_weekday !== null)) {
      return {
        error: 'repeat_unit null or never clears the rule. Omit repeat_interval and repeat_weekday.',
      };
    }
    return { ...EMPTY_REPEAT };
  }

  const unit = parsedUnit;
  if (unit === null) {
    if (intervalGiven) {
      return { error: 'Set repeat_unit to day, week, or month before repeat_interval.' };
    }
    if (weekdayGiven && args.input.repeat_weekday !== null) {
      return { error: 'repeat_weekday is only used when repeat_unit is week.' };
    }
    return { ...EMPTY_REPEAT };
  }

  if (unit === 'day' || unit === 'month') {
    if (typeof parsedWeekday === 'number') {
      return { error: 'repeat_weekday is only used when repeat_unit is week.' };
    }
    return { repeat_unit: unit, repeat_interval: parsedInterval, repeat_weekday: null };
  }

  let weekday: number | null;
  if (typeof parsedWeekday === 'number') weekday = parsedWeekday;
  else if (!weekdayGiven && args.current.repeat_unit === 'week' && args.current.repeat_weekday != null) {
    weekday = args.current.repeat_weekday;
  } else {
    weekday = (args.dueDate ? weekdayOfDate(args.dueDate) : null) ?? weekdayOfDate(args.todayUtc);
  }
  if (weekday == null) {
    return { error: 'repeat_weekday must be an integer from 0 (Sunday) to 6 (Saturday).' };
  }
  return { repeat_unit: 'week', repeat_interval: parsedInterval, repeat_weekday: weekday };
}

function parseRepeatUnit(value: string | null | undefined): RepeatUnit | 'clear' | { error: string } {
  if (value === null) return 'clear';
  const text = value?.trim().toLowerCase() ?? '';
  if (text === 'never') return 'clear';
  if (text === 'day' || text === 'week' || text === 'month') return text;
  return { error: 'repeat_unit must be day, week, month, never, or null.' };
}

function parseRepeatInterval(value: number | null | undefined): number | { error: string } {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 99) {
    return { error: 'repeat_interval must be an integer from 1 to 99.' };
  }
  return value;
}

function parseRepeatWeekday(value: number | null | undefined): number | null | { error: string } {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 6) {
    return { error: 'repeat_weekday must be an integer from 0 (Sunday) to 6 (Saturday), or null.' };
  }
  return value;
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

function validateCircleName(name: string | undefined): string | { error: string } {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return { error: 'Give your circle a name, like Home or Garden.' };
  if (trimmed.length > CIRCLE_NAME_MAX) {
    return { error: `Name must be ${CIRCLE_NAME_MAX} characters or fewer.` };
  }
  if ([...trimmed].some((char) => char.charCodeAt(0) < 32)) {
    return { error: 'Name cannot include line breaks or control characters.' };
  }
  return trimmed;
}

export function normalizeCircleColor(
  color: string | null | undefined,
): string | { error: string } {
  if (color === undefined || color === null || color.trim() === '') return DEFAULT_CIRCLE_COLOR;
  const trimmed = color.trim();
  const named = CIRCLE_COLORS.find((item) => item === trimmed.toLowerCase());
  if (named) return named;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  return {
    error: `color must be an accent (${CIRCLE_COLORS.join(', ')}) or a #rrggbb hex. Circles do not have an emoji or description.`,
  };
}

const TASK_MEDIA_LIST = Object.keys(TASK_MEDIA_TYPES).join(', ');

export function normalizeContentType(
  value: string | undefined,
): TaskMediaContentType | { error: string } {
  const mime = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mime in TASK_MEDIA_TYPES) return mime as TaskMediaContentType;
  return { error: `content_type must be an image or video: ${TASK_MEDIA_LIST}.` };
}

export function checkAttachmentSize(byteLength: number): string | null {
  if (byteLength <= 0) return 'The file is empty.';
  if (byteLength > TASK_MEDIA_MAX_BYTES) return 'File must be 50 MB or smaller.';
  return null;
}

export function chooseExtension(filename: string | undefined, contentType: TaskMediaContentType): string {
  const allowed = TASK_MEDIA_TYPES[contentType].extensions;
  const base = filename?.split(/[/\\]/).pop() ?? '';
  const ext = base.includes('.') ? (base.split('.').pop()?.toLowerCase() ?? '') : '';
  if ((allowed as readonly string[]).includes(ext)) return ext;
  return allowed[0];
}

export function taskMediaPath(spaceId: string, taskId: string, extension: string, fileId: string): string {
  return `${spaceId}/${taskId}/${fileId}.${extension}`;
}

type AttachmentSource = { kind: 'url'; url: string } | { kind: 'base64'; data: string };

function readAttachmentSource(input: AddAttachmentInput): AttachmentSource | { error: string } {
  const url = input.url?.trim() ?? '';
  const data = input.data_base64?.trim() ?? '';
  if (url && data) return { error: 'Pass a public https URL or base64 data, not both.' };
  if (!url && !data) return { error: 'Pass a public https URL in url, or base64 data in data_base64.' };
  if (url) return { kind: 'url', url };
  if (data.toLowerCase().startsWith('data:')) {
    return { error: 'Send raw base64 in data_base64, and set content_type separately. Do not send a data: URL.' };
  }
  return { kind: 'base64', data };
}

async function loadAttachmentBytes(
  source: AttachmentSource,
  contentType: TaskMediaContentType,
  deps: AttachmentDeps | undefined,
): Promise<{ bytes: Uint8Array } | { error: string }> {
  const bytes =
    source.kind === 'base64' ? decodeBase64(source.data) : await downloadPublicFile(source.url, contentType, deps);
  if (isFieldError(bytes)) return bytes;
  const sizeError = checkAttachmentSize(bytes.byteLength);
  if (sizeError) return { error: sizeError };
  if (!bytesMatchContentType(bytes, contentType)) {
    return { error: 'File contents do not match content_type.' };
  }
  return { bytes };
}

function decodeBase64(value: string): Uint8Array | { error: string } {
  const cleaned = value.replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 === 1) {
    return { error: 'data_base64 is not valid base64.' };
  }
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const estimated = (cleaned.length * 3) / 4 - padding;
  const sizeError = checkAttachmentSize(estimated);
  if (sizeError && estimated !== 0) return { error: sizeError };
  try {
    const binary = atob(cleaned);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  } catch {
    return { error: 'data_base64 is not valid base64.' };
  }
}

async function downloadPublicFile(
  rawUrl: string,
  contentType: TaskMediaContentType,
  deps: AttachmentDeps | undefined,
): Promise<Uint8Array | { error: string }> {
  const fetchImpl = deps?.fetch ?? fetch;
  let current = await assertPublicHttpsUrl(rawUrl, deps?.resolveDns);
  if (isFieldError(current)) return current;

  for (let hop = 0; hop < 4; hop += 1) {
    let response: Response;
    try {
      response = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: contentType },
      });
    } catch {
      return { error: 'Could not download that file.' };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return { error: 'Could not download that file.' };
      const next = await assertPublicHttpsUrl(new URL(location, current).href, deps?.resolveDns);
      if (isFieldError(next)) return next;
      current = next;
      continue;
    }

    if (!response.ok) return { error: `The file URL returned ${response.status}.` };
    const declared = headerMime(response.headers.get('content-type'));
    if (declared && declared !== contentType) {
      return { error: 'The downloaded file\'s type does not match content_type.' };
    }
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader) {
      const advertised = Number(lengthHeader);
      if (!Number.isFinite(advertised) || advertised > TASK_MEDIA_MAX_BYTES) {
        return { error: 'File must be 50 MB or smaller.' };
      }
    }
    return readLimited(response);
  }

  return { error: 'Could not download that file.' };
}

function headerMime(value: string | null): string | null {
  const mime = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mime || mime === 'application/octet-stream' || mime === 'binary/octet-stream') return null;
  return mime;
}

async function readLimited(response: Response): Promise<Uint8Array | { error: string }> {
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > TASK_MEDIA_MAX_BYTES) return { error: 'File must be 50 MB or smaller.' };
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > TASK_MEDIA_MAX_BYTES) {
      await reader.cancel();
      return { error: 'File must be 50 MB or smaller.' };
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function assertPublicHttpsUrl(
  raw: string,
  resolveDns: AttachmentDeps['resolveDns'],
): Promise<URL | { error: string }> {
  if (raw.length > 2000) return { error: 'url must be a public https address.' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'url must be a public https address.' };
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    return { error: 'url must be a public https address.' };
  }
  if (isBlockedHost(url.hostname)) return { error: 'That URL is not allowed.' };
  if (isIpAddress(url.hostname)) return url;

  const resolver = resolveDns ?? denoDnsResolver();
  if (!resolver) return url;
  let addresses: string[];
  try {
    addresses = await resolver(url.hostname);
  } catch {
    return { error: 'Could not resolve that URL.' };
  }
  if (addresses.length === 0 || addresses.some((address) => isBlockedHost(address))) {
    return { error: 'That URL is not allowed.' };
  }
  return url;
}

function denoDnsResolver(): AttachmentDeps['resolveDns'] {
  const deno = (globalThis as { Deno?: { resolveDns?: (hostname: string, record: 'A' | 'AAAA') => Promise<string[]> } })
    .Deno;
  if (!deno?.resolveDns) return undefined;
  const resolveDns = deno.resolveDns.bind(deno);
  return async (hostname: string) => {
    const records = await Promise.all([
      resolveDns(hostname, 'A').catch(() => [] as string[]),
      resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
    ]);
    return records.flat();
  };
}

function isIpAddress(hostname: string): boolean {
  const host = unwrapHost(hostname);
  return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function isBlockedHost(hostname: string): boolean {
  const host = unwrapHost(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host === 'metadata.google.internal' || host === 'metadata.google.com') return true;
  if (/^\d+$/.test(host)) return true;
  if (host.includes('%')) return true;
  if (host.includes(':')) return isBlockedIpv6(host);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return isBlockedIpv4(host);
  return false;
}

function unwrapHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
}

function isBlockedIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.some((part) => part.length > 1 && part.startsWith('0'))) return true;
  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const a = nums[0] ?? 0;
  const b = nums[1] ?? 0;
  const c = nums[2] ?? 0;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19 || b === 51)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedIpv6(host: string): boolean {
  if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('fc') || host.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(host)) return true;
  if (host.startsWith('::ffff:')) return isBlockedHost(host.slice('::ffff:'.length));
  return false;
}

export function bytesMatchContentType(bytes: Uint8Array, contentType: TaskMediaContentType): boolean {
  if (bytes.byteLength < 12) return false;
  switch (contentType) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    case 'image/gif': {
      const header = ascii(bytes, 0, 6);
      return header === 'GIF87a' || header === 'GIF89a';
    }
    case 'image/webp':
      return ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP';
    case 'image/heic':
    case 'image/heif':
      return HEIF_BRANDS.has(isoBrand(bytes) ?? '');
    case 'video/webm':
      return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    case 'video/mp4':
      return MP4_BRANDS.has(isoBrand(bytes) ?? '');
    case 'video/quicktime':
      return isoBrand(bytes) === 'qt  ';
    default:
      return false;
  }
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1']);
const MP4_BRANDS = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'mp4v', 'mmp4', 'dash', 'msnv', 'M4V ']);

function isoBrand(bytes: Uint8Array): string | null {
  if (ascii(bytes, 4, 4) !== 'ftyp') return null;
  return ascii(bytes, 8, 4);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let text = '';
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[start + index] ?? 0);
  return text;
}
