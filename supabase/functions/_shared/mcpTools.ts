/**
 * Tool handlers for the Trove MCP server.
 *
 * Circles are rows in public.spaces. "Mine" is not a circle: it is every task
 * assigned to the signed-in person. The personal circle is their is_default space.
 *
 * move_task matches public.move_task: the caller must be able to edit the
 * source circle, must belong to the destination (a viewer may receive a
 * task), and any assignee who is not a member of the destination is removed.
 * People who belong to the destination stay. Tags that belong to the old
 * circle are removed.
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
 * done: the database trigger inserts the next occurrence. in_progress does
 * not. Status is todo, in_progress, or done.
 */

import { INVITE_LIMIT_PER_DAY } from './inviteLimit.ts';

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
  'handoff_task',
  'add_agent_log_entry',
  'list_agent_log',
  'get_task',
  'move_task',
  'add_task_attachment',
  'list_members',
  'invite_to_circle',
  'list_today',
  'add_today_item',
  'dismiss_today_item',
  'restore_today_item',
  'move_today_item_to_day',
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
    'List tasks assigned to the signed-in person across every circle they belong to (their Mine list). A task is included when they are any of its assignees. Optional filters: circle, status (todo, in_progress, or done), and due date (due_on, due_before, due_after as YYYY-MM-DD). A status filter is exact: todo does not include in_progress. This is not limited to the personal circle. Results are ordered by rank (higher first), then due date (earliest first, no date last). Each task includes rank, repeat_unit, repeat_interval, repeat_weekday, and recurrence_series_id. recurrence_source_id is not returned. rank is the fractional ordering key shared with the circle.',
  list_circle_tasks:
    'List every task in one circle, not only tasks assigned to the caller. Viewers can read. Optional filters: status (todo, in_progress, or done) and due date. A status filter is exact: todo does not include in_progress. Results are ordered by rank (higher first), then due date (earliest first, no date last). Each task includes rank, repeat_unit, repeat_interval, repeat_weekday, and recurrence_series_id. recurrence_source_id is not returned.',
  create_task:
    'Create a task. Put it in a circle with circle_id or circle_name, or set personal to true for the private personal circle. If you name no circle, it goes in the personal circle and is assigned to the caller, which is how a new capture shows up on Mine. notes is the description. tags are label names in that circle (created if needed). assignee is one member id, display name, "me", or null. assignees is a list of those same values and replaces the whole set. Pass assignee or assignees, not both. Omitting both assigns the caller. priority is low, medium, high, or null and chooses a starting rank in the overall order of that circle: high above the current top, medium in the middle, low or null at the bottom. external_id is an optional stable id from Notion, Trello, or another export; repeating it returns the existing task instead of creating a duplicate. Optional repeat_unit is day, week, month, never, or null. repeat_interval is 1 to 99 (default 1). repeat_weekday is 0 (Sunday) through 6 (Saturday) and is only stored for week. Omit the repeat fields and the task does not repeat. status is todo, in_progress, or done. Agents: assign yourself and set in_progress when you start.',
  create_tasks_bulk:
    'Create up to 100 tasks in one call, for importing a list. Each item has the same fields as create_task, including the optional repeat fields. A circle set on the call is the default; an item can override it. external_id makes the import safe to retry: a task the caller already created with that id is returned as existing and is not changed. Items that fail are reported; earlier items in the batch are kept.',
  update_task:
    'Change a task\'s title, notes, status, priority, due date, assignees, tags, or repeat rule. status is todo, in_progress, or done. priority is low, medium, high, or null. For an owner or admin it also sets rank in the circle\'s overall order: high above the current top, medium in the middle, low or null at the bottom. A member can set the priority label but cannot change rank. Changing the due date leaves rank unchanged. assignee or assignees replaces the whole set of people. Pass one of those fields, not both. An empty assignees list, or assignee null, clears everyone. Tags replace the current set. repeat_unit null or never clears the repeat rule. repeat_interval is 1 to 99. repeat_weekday is 0 (Sunday) through 6 (Saturday) and is only used for week. This does not move the task to another circle; use move_task for that. Only someone who can edit the circle (owner, admin, or member) can update. Viewers cannot. Setting status to done on a repeating task leaves this row done; the database inserts the next occurrence at the bottom of its due-date group. This is a plain assign with no note. To pass work you own to someone else, use handoff_task.',
  complete_task:
    'Mark a task done. Same permission as update_task. If the task repeats, the database inserts the next To do occurrence with the same rule. This result is the completed row, including its repeat fields and recurrence_series_id. recurrence_source_id is not returned.',
  assign_task:
    'Replace the people assigned to a task. assignee is one member id, display name, "me", or null. assignees is a list of those values. Pass one of them, not both. An empty list or null clears everyone. Each person must already be a member of the task\'s circle. This is a plain assign with no note. To pass work you own to someone else, use handoff_task.',
  handoff_task:
    'Pass a task you are assigned to someone else in the same circle. You are removed and they take your place. Other assignees stay. Rank stays. to is a member id or display name, not "me". status is todo or in_progress. Omit it to keep the current status. A done task reopens to todo unless you pass in_progress. Passing done fails. note is optional, up to 2000 characters.',
  add_agent_log_entry:
    'Append a short status update to a task\'s agent log. Only an agent member of that circle can write. body is required, up to 4000 characters. A task holds at most 500 entries. Do not put this in the task notes.',
  list_agent_log:
    'Read a task\'s agent log, newest first. Anyone who can see the task can read it. limit defaults to 20 and cannot exceed 100.',
  get_task:
    'Get one task by id, including latest_handoff, agent_log_count, and the last 5 agent log entries, newest first.',
  move_task:
    'Move a task from one circle to another, including from the personal circle into a shared circle. The caller must be able to edit the task where it is now, and must be a member of the destination (a viewer of the destination may still receive it). People who are not members of the destination are unassigned. People who are stay assigned. Tags from the old circle are removed. Photos and videos stay in the original circle and are not moved. Pass circle_id, circle_name, or personal: true.',
  add_task_attachment:
    'Attach an image or video to a task the caller can edit (owner, admin, or member). Viewers cannot. Pass task_id, content_type, and either a public https url (the server downloads it) or data_base64. Allowed types: image/jpeg, image/png, image/webp, image/gif, image/heic, image/heif, video/mp4, video/quicktime, video/webm. Maximum 50 MB. The file is stored like a photo added in the app, under the task\'s circle, and shows in the task media gallery. Several attachments per task are kept in the order they were added. Returns the attachment id.',
  list_members:
    'List the people in a circle: user id, display name, role (owner, admin, member, viewer), and whether the membership was created from an agent invite. Email addresses are not included.',
  invite_to_circle:
    'Invite someone to a circle by email. Only an owner or admin can invite. This sends an email to that address as soon as the invite is created (database trigger invites_send_email). You can create 25 invites in 24 hours; over that, the invite is not created and no email is sent. role is admin, member, or viewer (default member). agent true marks the invite as a bot; the flag is copied onto the membership when they join. It defaults to false, a human invite. Returns the invite token and an https link. The link opens Trove, or offers the download if they do not have the app yet. The invite expires in 14 days. One pending invite per email per circle.',
  list_today:
    'List the signed-in person\'s private Today checklist for one date. Today is not a circle and is never shared. A task is on Today only when this person has a line for it on that date, not because of its due date. day is YYYY-MM-DD and defaults to the current UTC date. local_today is the person\'s local date and defaults to the UTC date; pass both to match the app. A day after local_today is a plan: it is not prepared, unticked lines do not roll into it, and routines due that weekday are included as previews (id starts with preview:). Today and earlier dates are prepared on the first read: routines are added at their saved ranks, then unticked one-offs from the previous day move under lines already there. Lines taken off a day (Not today) stay off and do not roll. Ticked lines stay on the day they were ticked. Repeating lines do not move. Reading an earlier day after a later one was prepared does not pull lines backward. Lines are ordered by rank (higher first). repeat_days is a Sunday-based bitmask (bit 0 = Sunday) when the line will come back; otherwise null. checked_at is null when the line is unticked.',
  add_today_item:
    'Append a line to the signed-in person\'s private Today list, or to tomorrow when day is the day after local_today. Pass text or task_id, not both. task_id must be a task they can see, and the same task cannot be added twice on the same day, including when a routine already shows it. A task that was taken off that day is put back instead of inserted twice. The line goes at the bottom. day defaults to the current UTC date. local_today is the person\'s local date and defaults to the UTC date. A day after local_today is stored as a plan and is not prepared, so today\'s unticked lines stay put. Today and earlier dates are prepared first.',
  dismiss_today_item:
    'Take one Today line off its day (Not today). The line disappears from Today and does not roll onto tomorrow. If it is a task, the task stays in its circle: this does not delete it, complete it, or change its due date. If it repeats, the routine stays active and still appears on later scheduled days. Ticked lines stay on their day. Pass the line id from list_today, not a preview id. Idempotent when the line is already off the day.',
  restore_today_item:
    'Put a Today line back on the day it was taken off. Does not change the linked task. Pass the same line id dismiss_today_item used.',
  move_today_item_to_day:
    'Move one Today line to the person\'s local today or the next day (Tomorrow). It leaves the day it is on and shows on the destination. Tomorrow is stored as a plan and is not prepared, so today\'s other unticked lines stay put. The line goes to the bottom of that day. Ticked lines cannot move to tomorrow. Pass item_id from list_today, day as YYYY-MM-DD, and local_today as the person\'s local date. This does not change the task\'s due date or status.',
};

export type Role = 'owner' | 'admin' | 'member' | 'viewer';
export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type Status = (typeof TASK_STATUSES)[number];
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
  /** True when this membership was created from an agent invite. */
  is_agent: boolean;
};

export type TaskPerson = {
  user_id: string;
  display_name: string | null;
};

export type TaskTag = { name: string; circle_id: string };

/** Newest handoff on a task. Null when the task has never been handed off. */
export type HandoffRecord = {
  id: string;
  from_user_id: string | null;
  from_name: string | null;
  to_user_id: string | null;
  to_name: string | null;
  status: 'todo' | 'in_progress';
  note: string | null;
  created_at: string;
};

/** One agent log row, newest first when listed. */
export type AgentLogEntry = {
  id: string;
  task_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
};

export type TaskRecord = {
  id: string;
  title: string;
  notes: string | null;
  status: Status;
  priority: Priority | null;
  /** Fractional index. Larger keys sort first. Due date breaks a tie. */
  rank: string;
  due_date: string | null;
  circle_id: string;
  circle_name: string;
  /** First assignee, by position. The full set is assignees. */
  assignee_id: string | null;
  assignee_name: string | null;
  assignees: TaskPerson[];
  tags: string[];
  external_id: string | null;
  repeat_unit: RepeatUnit | null;
  repeat_interval: number;
  repeat_weekday: number | null;
  recurrence_series_id: string | null;
  /** Newest handoff, or null. Present on every task this server returns. */
  latest_handoff: HandoffRecord | null;
  /** How many agent log entries the task has. The entries themselves come from get_task or list_agent_log. */
  agent_log_count: number;
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
  assigneeIds: string[];
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
  assigneeIds?: string[];
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
  is_agent: boolean;
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

/** One private Today line. repeat_days is set only while the routine is active. */
export type TodayEntry = {
  id: string;
  day: string;
  text: string | null;
  task_id: string | null;
  task_title: string | null;
  circle_id: string | null;
  circle_name: string | null;
  circle_color: string | null;
  routine_id: string | null;
  repeat_days: number | null;
  rank: string;
  checked_at: string | null;
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
  /**
   * Hand the caller's assignment to someone else. The database checks
   * membership, keeps rank, and writes the handoff row.
   */
  handoffTask(input: {
    taskId: string;
    toUserId: string;
    status: 'todo' | 'in_progress' | null;
    note: string | null;
  }): Promise<TaskRecord>;
  addAgentLogEntry(taskId: string, body: string): Promise<AgentLogEntry>;
  /** Newest first. */
  listAgentLog(taskId: string, limit: number): Promise<AgentLogEntry[]>;
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
    isAgent?: boolean;
  }): Promise<InviteResult>;
  /** Invites this person created in the last 24 hours, including ones that were later revoked. */
  countRecentInvites(): Promise<number>;
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
  /** Prepare the caller's Today list for this date. Idempotent. */
  ensureToday(day: string): Promise<void>;
  listToday(day: string): Promise<TodayEntry[]>;
  /**
   * Stored lines for a day that must not be prepared, plus routine previews.
   * Does not write today_days and does not roll lines forward.
   */
  listTodayPlan(day: string): Promise<TodayEntry[]>;
  /**
   * Append a text line or a linked task. The day is prepared only when it is
   * on or before asOf. Pass asOf null to let the database compare with UTC.
   */
  addTodayItem(input: {
    day: string;
    text: string | null;
    taskId: string | null;
    asOf: string | null;
  }): Promise<TodayEntry>;
  /**
   * Hide one line for its day. Does not delete, complete, or reschedule the
   * linked task, and does not stop a routine.
   */
  dismissTodayItem(itemId: string): Promise<void>;
  /** Clear Not today for one line. */
  restoreTodayItem(itemId: string): Promise<TodayEntry>;
  /**
   * Move one stored line to local today or the next day. Tomorrow is not
   * prepared. The linked task's due date and status stay as they are.
   */
  moveTodayItem(input: { itemId: string; day: string; asOf: string }): Promise<TodayEntry>;
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
      nextAssigneeIds: string[];
    }
  | { ok: false; error: string };

/**
 * The same decisions as public.move_task. People who belong to the
 * destination stay, in their existing order. Tags carry the circle they
 * belong to; ones from anywhere but the destination are removed.
 */
export function planMove(input: {
  callerSourceRole: Role | null;
  callerIsTargetMember: boolean;
  targetExists: boolean;
  sourceCircleId: string;
  targetCircleId: string;
  assigneeIds: string[];
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
    return {
      ok: true,
      alreadyThere: true,
      assigneeCleared: false,
      tagsRemoved: 0,
      nextAssigneeIds: input.assigneeIds,
    };
  }
  const nextAssigneeIds = input.assigneeIds.filter((id) => input.targetMemberIds.includes(id));
  const tagsRemoved = input.tags.filter((tag) => tag.circle_id !== input.targetCircleId).length;
  return {
    ok: true,
    alreadyThere: false,
    assigneeCleared: nextAssigneeIds.length !== input.assigneeIds.length,
    tagsRemoved,
    nextAssigneeIds,
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
  status?: string;
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
    const status = readStatus(input.status);
    if (isFieldError(status)) return { ok: false, error: status.error };

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
      status,
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
  assignees?: (string | null)[] | null;
  due_date?: string | null;
  tags?: string[];
  status?: string;
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
    status?: string;
    priority?: Priority | null;
    due_date?: string | null;
    assignee?: string | null;
    assignees?: (string | null)[] | null;
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
  input: { task_id: string; assignee?: string | null; assignees?: (string | null)[] | null },
): Promise<ToolResult<{ task: TaskRecord }>> {
  if (input.assignee === undefined && input.assignees === undefined) {
    return { ok: false, error: 'Pass assignee or assignees.' };
  }
  return updateTask(store, {
    task_id: input.task_id,
    assignee: input.assignee,
    assignees: input.assignees,
  });
}

export async function handoffTask(
  store: TroveStore,
  input: { task_id: string; to: string; status?: string | null; note?: string | null },
): Promise<ToolResult<{ task: TaskRecord }>> {
  try {
    const task = await store.getTask(input.task_id);
    if (!task) return { ok: false, error: 'Task not found' };
    const circles = await store.listCircles();
    const circle = circles.find((item) => item.id === task.circle_id);
    if (!circle) return { ok: false, error: 'Task not found' };
    if (!canWrite(circle.role)) return { ok: false, error: "You can't edit this task" };
    if (!task.assignees.some((person) => person.user_id === store.userId)) {
      return { ok: false, error: "This task isn't yours to hand off. Use assign_task." };
    }
    const needle = input.to?.trim() ?? '';
    if (!needle || needle.toLowerCase() === 'me') {
      return { ok: false, error: 'You already have this task' };
    }
    const members = await store.listMembers(task.circle_id);
    const resolved = await resolveAssignee(store.userId, members, needle, false);
    if ('error' in resolved) {
      if (resolved.error === 'That person is not a member of this circle.') {
        return { ok: false, error: 'That person is not in this circle' };
      }
      return { ok: false, error: resolved.error };
    }
    if (!resolved.id || resolved.id === store.userId) {
      return { ok: false, error: 'You already have this task' };
    }
    let status: 'todo' | 'in_progress' | null = null;
    if (input.status != null && input.status !== '') {
      if (input.status === 'done') {
        return { ok: false, error: 'To finish a task, complete it instead' };
      }
      if (input.status !== 'todo' && input.status !== 'in_progress') {
        return { ok: false, error: 'Status must be todo or in_progress' };
      }
      status = input.status;
    }
    let note: string | null = null;
    if (input.note != null) {
      note = input.note.trim();
      if (!note) note = null;
      if (note && note.length > 2000) {
        return { ok: false, error: 'A handoff note can be 2000 characters or fewer' };
      }
    }
    const updated = await store.handoffTask({
      taskId: task.id,
      toUserId: resolved.id,
      status,
      note,
    });
    return { ok: true, data: { task: updated } };
  } catch (error) {
    return fail(error);
  }
}

export async function addAgentLogEntry(
  store: TroveStore,
  input: { task_id: string; body: string },
): Promise<ToolResult<{ entry: AgentLogEntry }>> {
  try {
    const task = await store.getTask(input.task_id);
    if (!task) return { ok: false, error: 'Task not found' };
    const circles = await store.listCircles();
    const circle = circles.find((item) => item.id === task.circle_id);
    if (!circle) return { ok: false, error: 'Task not found' };
    if (!canWrite(circle.role)) return { ok: false, error: "You can't edit this task" };
    const members = await store.listMembers(task.circle_id);
    const caller = members.find((member) => member.user_id === store.userId);
    if (!caller?.is_agent) return { ok: false, error: 'Only agents write to the agent log' };
    const body = input.body?.trim() ?? '';
    if (!body) return { ok: false, error: 'An agent log entry needs text' };
    if (body.length > 4000) {
      return { ok: false, error: 'An agent log entry can be 4000 characters or fewer' };
    }
    const entry = await store.addAgentLogEntry(task.id, body);
    return { ok: true, data: { entry } };
  } catch (error) {
    return fail(error);
  }
}

export async function listAgentLog(
  store: TroveStore,
  input: { task_id: string; limit?: number },
): Promise<ToolResult<{ entries: AgentLogEntry[] }>> {
  try {
    const task = await store.getTask(input.task_id);
    if (!task) return { ok: false, error: 'Task not found' };
    const requested = input.limit ?? 20;
    const limit = Math.min(100, Math.max(1, requested));
    const entries = await store.listAgentLog(task.id, limit);
    return { ok: true, data: { entries } };
  } catch (error) {
    return fail(error);
  }
}

export async function getTask(
  store: TroveStore,
  input: { task_id: string },
): Promise<ToolResult<{ task: TaskRecord & { agent_log: AgentLogEntry[] } }>> {
  try {
    const task = await store.getTask(input.task_id);
    if (!task) return { ok: false, error: 'Task not found' };
    const agent_log = await store.listAgentLog(task.id, 5);
    return { ok: true, data: { task: { ...task, agent_log } } };
  } catch (error) {
    return fail(error);
  }
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
      assigneeIds: task.assignees.map((person) => person.user_id),
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
  input: CircleTarget & {
    email: string;
    role?: 'admin' | 'member' | 'viewer' | 'owner';
    agent?: boolean;
  },
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
    const recent = await store.countRecentInvites();
    if (recent >= INVITE_LIMIT_PER_DAY) {
      return {
        ok: false,
        error: `You can send ${INVITE_LIMIT_PER_DAY} invites in 24 hours. This one was not created, and no email was sent. Try again later.`,
      };
    }
    const invite = await store.createInvite({
      circleId: circle.id,
      email,
      role,
      isAgent: input.agent === true,
    });
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
  const status = readStatus(input.status);
  if (isFieldError(status)) return { ok: false, error: status.error };
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
  const assignees = await resolveAssigneeList(store.userId, members, input, 'create');
  if (!assignees || 'error' in assignees) {
    return { ok: false, error: assignees && 'error' in assignees ? assignees.error : 'Choose who to assign.' };
  }

  return {
    ok: true,
    existing: null,
    write: {
      circleId: circle.id,
      title,
      notes,
      status: status ?? 'todo',
      priority: input.priority ?? null,
      dueDate: due,
      assigneeIds: assignees.ids,
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
    assigneeIds: [],
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
    status?: string;
    priority?: Priority | null;
    due_date?: string | null;
    assignee?: string | null;
    assignees?: (string | null)[] | null;
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
    const status = readStatus(input.status);
    if (isFieldError(status) || status === undefined) {
      return { ok: false, error: status && 'error' in status ? status.error : 'Unknown status.' };
    }
    patch.status = status;
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
  if (input.assignee !== undefined || input.assignees !== undefined) {
    const members = await store.listMembers(task.circle_id);
    const assignees = await resolveAssigneeList(store.userId, members, input, 'update');
    if (!assignees || 'error' in assignees) {
      return {
        ok: false,
        error: assignees && 'error' in assignees ? assignees.error : 'Choose who to assign.',
      };
    }
    patch.assigneeIds = assignees.ids;
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

async function resolveAssigneeList(
  callerId: string,
  members: Member[],
  input: { assignee?: string | null; assignees?: (string | null)[] | null },
  mode: 'create' | 'update',
): Promise<{ ids: string[] } | { error: string } | undefined> {
  const hasAssignee = input.assignee !== undefined;
  const hasAssignees = input.assignees !== undefined;
  if (hasAssignee && hasAssignees) return { error: 'Pass assignee or assignees, not both.' };
  if (!hasAssignee && !hasAssignees) {
    if (mode === 'update') return undefined;
    const self = await resolveAssignee(callerId, members, undefined, true);
    if ('error' in self) return self;
    return { ids: self.id ? [self.id] : [] };
  }
  if (input.assignees !== undefined) {
    const list = input.assignees;
    if (list === null || list.length === 0) return { ids: [] };
    const ids: string[] = [];
    for (const item of list) {
      if (item === null || item.trim() === '' || item.trim().toLowerCase() === 'unassigned') {
        return { error: 'Each assignee must be a member. Pass an empty list to unassign.' };
      }
      const resolved = await resolveAssignee(callerId, members, item, false);
      if ('error' in resolved) return resolved;
      if (resolved.id && !ids.includes(resolved.id)) ids.push(resolved.id);
    }
    return { ids };
  }
  const resolved = await resolveAssignee(callerId, members, input.assignee, false);
  if ('error' in resolved) return resolved;
  return { ids: resolved.id ? [resolved.id] : [] };
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

function readStatus(value: string | undefined): Status | undefined | { error: string } {
  if (value === undefined) return undefined;
  if ((TASK_STATUSES as readonly string[]).includes(value)) return value as Status;
  return { error: 'Unknown status.' };
}

function isPriority(value: string): value is Priority {
  return value === 'low' || value === 'medium' || value === 'high';
}

const TODAY_TEXT_MAX = 4000;

export async function listToday(
  store: TroveStore,
  input: { day?: string; local_today?: string },
): Promise<ToolResult<{ day: string; items: TodayEntry[] }>> {
  const day = resolveTodayDay(input.day);
  if (typeof day !== 'string') return { ok: false, error: day.error };
  const asOf = resolveLocalToday(input.local_today);
  if (typeof asOf !== 'string') return { ok: false, error: asOf.error };
  try {
    if (day > asOf) {
      return { ok: true, data: { day, items: await store.listTodayPlan(day) } };
    }
    await store.ensureToday(day);
    return { ok: true, data: { day, items: await store.listToday(day) } };
  } catch (error) {
    return fail(error);
  }
}

export async function addTodayItem(
  store: TroveStore,
  input: { day?: string; local_today?: string; text?: string | null; task_id?: string | null },
): Promise<ToolResult<{ day: string; item: TodayEntry }>> {
  const day = resolveTodayDay(input.day);
  if (typeof day !== 'string') return { ok: false, error: day.error };
  const asOf = resolveLocalToday(input.local_today);
  if (typeof asOf !== 'string') return { ok: false, error: asOf.error };
  const text = input.text?.trim() ?? '';
  const taskId = input.task_id ?? null;
  if (text && taskId) return { ok: false, error: 'Pass text or task_id, not both.' };
  if (!text && !taskId) return { ok: false, error: 'Pass text or task_id.' };
  if ([...text].some((char) => char.charCodeAt(0) < 32)) {
    return { ok: false, error: 'A line cannot include line breaks or control characters.' };
  }
  if (text.length > TODAY_TEXT_MAX) {
    return { ok: false, error: `A line can be ${TODAY_TEXT_MAX} characters or fewer.` };
  }
  try {
    const item = await store.addTodayItem({ day, text: text || null, taskId, asOf });
    return { ok: true, data: { day, item } };
  } catch (error) {
    return fail(error);
  }
}

function resolveTodayDay(value: string | undefined): string | { error: string } {
  if (value === undefined || value.trim() === '') return utcDateString();
  const day = parseDueDate(value.trim());
  if (!day) return { error: 'day must be a real date as YYYY-MM-DD.' };
  return day;
}

function resolveLocalToday(value: string | undefined): string | { error: string } {
  if (value === undefined || value.trim() === '') return utcDateString();
  const day = parseDueDate(value.trim());
  if (!day) return { error: 'local_today must be a real date as YYYY-MM-DD.' };
  return day;
}

export async function dismissTodayItem(
  store: TroveStore,
  input: { item_id?: string },
): Promise<ToolResult<{ item_id: string }>> {
  const itemId = input.item_id?.trim() ?? '';
  if (!itemId) return { ok: false, error: 'item_id is required.' };
  if (itemId.startsWith('preview:')) {
    return { ok: false, error: 'That line is a preview. Take off the stored line on today.' };
  }
  try {
    await store.dismissTodayItem(itemId);
    return { ok: true, data: { item_id: itemId } };
  } catch (error) {
    return fail(error);
  }
}

export async function restoreTodayItem(
  store: TroveStore,
  input: { item_id?: string },
): Promise<ToolResult<{ item: TodayEntry }>> {
  const itemId = input.item_id?.trim() ?? '';
  if (!itemId) return { ok: false, error: 'item_id is required.' };
  try {
    const item = await store.restoreTodayItem(itemId);
    return { ok: true, data: { item } };
  } catch (error) {
    return fail(error);
  }
}

export async function moveTodayItem(
  store: TroveStore,
  input: { item_id?: string; day?: string; local_today?: string },
): Promise<ToolResult<{ item: TodayEntry }>> {
  const itemId = input.item_id?.trim() ?? '';
  if (!itemId) return { ok: false, error: 'item_id is required.' };
  if (itemId.startsWith('preview:')) {
    return { ok: false, error: 'That line is a preview. Move the stored line.' };
  }
  const day = resolveTodayDay(input.day);
  if (typeof day !== 'string') return { ok: false, error: day.error };
  const asOf = resolveLocalToday(input.local_today);
  if (typeof asOf !== 'string') return { ok: false, error: asOf.error };
  if (day !== asOf && day !== shiftIsoDay(asOf, 1)) {
    return { ok: false, error: 'You can move a line to today or tomorrow.' };
  }
  try {
    const item = await store.moveTodayItem({ itemId, day, asOf });
    return { ok: true, data: { item } };
  } catch (error) {
    return fail(error);
  }
}

function shiftIsoDay(iso: string, amount: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + amount);
  const monthText = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const dayText = `${date.getUTCDate()}`.padStart(2, '0');
  return `${date.getUTCFullYear()}-${monthText}-${dayText}`;
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
