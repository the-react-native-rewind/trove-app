// User-scoped data access. Every query uses the caller's JWT, so existing
// RLS policies decide what they can see and change. move_task is the
// security-definer RPC from migration 0011.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { generateKeyBetween } from 'npm:fractional-indexing@3.2.0';

import {
  canManage,
  TroveError,
  type RepeatUnit,
  type Priority,
  type Circle,
  type AttachmentRecord,
  type AttachmentWrite,
  type CircleCreate,
  type InviteResult,
  type Member,
  type MoveResult,
  type Role,
  type Status,
  type TaskFilter,
  type TaskPatch,
  type TaskRecord,
  type TaskWrite,
  type TroveStore,
  taskMediaPath,
} from '../_shared/mcpTools.ts';
import { readEnv, userClient } from './auth.ts';
import { DEFAULT_SITE_URL, inviteUrl } from '../_shared/site.ts';

const TASK_SELECT =
  'id, title, description, status, priority, rank, due_date, space_id, external_id, repeat_unit, repeat_interval, repeat_weekday, recurrence_series_id, created_at, updated_at, space:spaces(id,name), assignees:task_assignees(position, profile:profiles(id,display_name)), task_labels(label:labels(name))';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  rank: string;
  due_date: string | null;
  space_id: string;
  external_id: string | null;
  repeat_unit: string | null;
  repeat_interval: number | null;
  repeat_weekday: number | null;
  recurrence_series_id: string | null;
  created_at: string;
  updated_at: string;
  space: { id: string; name: string } | { id: string; name: string }[] | null;
  assignees:
    | {
        position?: number | null;
        profile:
          | { id: string; display_name: string | null }
          | { id: string; display_name: string | null }[]
          | null;
      }[]
    | null;
  task_labels: { label: { name: string } | { name: string }[] | null }[] | null;
};

export async function supabaseStore(userId: string, accessToken: string): Promise<TroveStore> {
  const db = userClient(readEnv(), accessToken);

  return {
    userId,
    listCircles: (options) => listCircles(db, userId, options),
    listMembers: (circleId) => listMembers(db, circleId),
    listTasks: (filter) => listTasks(db, filter),
    getTask: (id) => getTask(db, id),
    findByExternalId: (externalId) => findByExternalId(db, userId, externalId),
    insertTask: (input) => insertTask(db, userId, input),
    updateTask: (id, patch) => updateTask(db, userId, id, patch),
    moveTask: (taskId, targetCircleId) => moveTask(db, taskId, targetCircleId),
    createInvite: (input) => createInvite(db, userId, input),
    createCircle: (input) => createCircle(db, userId, input),
    addTaskAttachment: (input) => addTaskAttachment(db, userId, input),
  };
}

async function listCircles(
  db: SupabaseClient,
  userId: string,
  options?: { includeOpenCounts?: boolean },
): Promise<Circle[]> {
  const { data: memberships, error } = await db
    .from('space_members')
    .select('role, space:spaces(id,name,color,is_default)')
    .eq('user_id', userId);
  throwIf(error);

  const counts = options?.includeOpenCounts ? await openTaskCounts(db) : new Map<string, number>();

  const circles: Circle[] = [];
  for (const membership of memberships ?? []) {
    const space = one(membership.space as TaskRow['space']);
    if (!space) continue;
    circles.push({
      id: space.id,
      name: space.name,
      color: 'color' in space && typeof space.color === 'string' ? space.color : 'sage',
      role: membership.role as Role,
      is_personal: Boolean((space as { is_default?: boolean }).is_default),
      open_task_count: counts.get(space.id) ?? 0,
    });
  }

  circles.sort((a, b) => {
    if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return circles;
}

async function openTaskCounts(db: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await db.rpc('open_task_counts');
  throwIf(error);
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { space_id: string; open_count: number | string }[]) {
    counts.set(row.space_id, Number(row.open_count));
  }
  return counts;
}

async function listMembers(db: SupabaseClient, circleId: string): Promise<Member[]> {
  const { data, error } = await db
    .from('space_members')
    .select('user_id, role, is_agent, profile:profiles(display_name)')
    .eq('space_id', circleId)
    .order('created_at', { ascending: true });
  throwIf(error);
  return (data ?? []).map((row) => {
    const profile = one(row.profile as { display_name: string | null } | { display_name: string | null }[] | null);
    return {
      user_id: row.user_id,
      display_name: profile?.display_name ?? null,
      role: row.role as Role,
      is_agent: Boolean(row.is_agent),
    };
  });
}

async function listTasks(db: SupabaseClient, filter: TaskFilter): Promise<TaskRecord[]> {
  let assignedIds: string[] | undefined;
  if (filter.assigneeId) {
    const { data: links, error: linkError } = await db
      .from('task_assignees')
      .select('task_id')
      .eq('user_id', filter.assigneeId);
    throwIf(linkError);
    assignedIds = [...new Set((links ?? []).map((link) => link.task_id as string))];
    if (assignedIds.length === 0) return [];
  }

  let query = db.from('tasks').select(TASK_SELECT);
  if (assignedIds) query = query.in('id', assignedIds);
  if (filter.circleId) query = query.eq('space_id', filter.circleId);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.dueOn) query = query.eq('due_date', filter.dueOn);
  if (filter.dueBefore) query = query.lte('due_date', filter.dueBefore);
  if (filter.dueAfter) query = query.gte('due_date', filter.dueAfter);
  const { data, error } = await query
    .order('rank', { ascending: false })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(filter.limit);
  throwIf(error);
  return (data ?? []).map((row) => toTask(row as unknown as TaskRow));
}

async function getTask(db: SupabaseClient, id: string): Promise<TaskRecord | null> {
  const { data, error } = await db.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle();
  throwIf(error);
  return data ? toTask(data as unknown as TaskRow) : null;
}

async function findByExternalId(
  db: SupabaseClient,
  userId: string,
  externalId: string,
): Promise<TaskRecord | null> {
  const { data, error } = await db
    .from('tasks')
    .select(TASK_SELECT)
    .eq('created_by', userId)
    .eq('external_id', externalId)
    .maybeSingle();
  throwIf(error);
  return data ? toTask(data as unknown as TaskRow) : null;
}

async function insertTask(db: SupabaseClient, userId: string, input: TaskWrite): Promise<TaskRecord> {
  const ranks = await ranksInCircle(db, input.circleId);
  const { data, error } = await db
    .from('tasks')
    .insert({
      space_id: input.circleId,
      title: input.title,
      description: input.notes,
      status: input.status,
      priority: input.priority,
      rank: rankForPriority(input.priority, ranks),
      due_date: input.dueDate,
      external_id: input.externalId,
      created_by: userId,
      position: input.position,
      repeat_unit: input.repeatUnit,
      repeat_interval: input.repeatInterval,
      repeat_weekday: input.repeatWeekday,
    })
    .select(TASK_SELECT)
    .single();
  if (error) {
    if (error.code === '23505' && input.externalId) {
      const existing = await findByExternalId(db, userId, input.externalId);
      if (existing) return existing;
      throw new TroveError('A task with this external_id already exists but is not visible to you.');
    }
    throwIf(error);
  }
  const task = toTask(data as unknown as TaskRow);
  if (input.tags.length) await replaceTags(db, task.id, task.circle_id, input.tags);
  if (input.assigneeIds.length) await replaceAssignees(db, task.id, input.assigneeIds);
  return (await getTask(db, task.id)) ?? task;
}

async function updateTask(
  db: SupabaseClient,
  userId: string,
  id: string,
  patch: TaskPatch,
): Promise<TaskRecord | null> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.notes !== undefined) row.description = patch.notes;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) {
    const current = await getTask(db, id);
    if (!current) return null;
    row.priority = patch.priority;
    // Rank is the circle's shared order. Members may label a task with a
    // priority, but only an owner or admin may move it.
    if (canManage((await roleInCircle(db, userId, current.circle_id)) ?? undefined)) {
      const ranks = (await ranksInCircle(db, current.circle_id)).filter((rank) => rank !== current.rank);
      row.rank = rankForPriority(patch.priority, ranks);
    }
  }
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.repeatUnit !== undefined) {
    row.repeat_unit = patch.repeatUnit;
    row.repeat_interval = patch.repeatInterval ?? 1;
    row.repeat_weekday = patch.repeatWeekday ?? null;
  }

  if (Object.keys(row).length) {
    const { error } = await db.from('tasks').update(row).eq('id', id);
    throwIf(error);
  }

  if (patch.tags) {
    const current = await getTask(db, id);
    if (!current) return null;
    await replaceTags(db, id, current.circle_id, patch.tags);
  }

  if (patch.assigneeIds !== undefined) await replaceAssignees(db, id, patch.assigneeIds);

  return getTask(db, id);
}

async function replaceAssignees(db: SupabaseClient, taskId: string, userIds: string[]): Promise<void> {
  const { error } = await db.rpc('set_task_assignees', {
    p_task_id: taskId,
    p_user_ids: userIds,
  });
  throwIf(error);
}

async function moveTask(db: SupabaseClient, taskId: string, targetCircleId: string): Promise<MoveResult> {
  const { data, error } = await db.rpc('move_task', {
    p_task_id: taskId,
    p_target_space_id: targetCircleId,
  });
  throwIf(error);
  const payload = data as {
    task_id?: string;
    source_space_id?: string;
    target_space_id?: string;
    assignee_cleared?: boolean;
    already_there?: boolean;
    tags_removed?: number;
  };
  const task = await getTask(db, taskId);
  if (!task) throw new TroveError('Task not found');
  return {
    task_id: payload.task_id ?? task.id,
    source_circle_id: payload.source_space_id ?? task.circle_id,
    target_circle_id: payload.target_space_id ?? targetCircleId,
    assignee_cleared: Boolean(payload.assignee_cleared),
    already_there: Boolean(payload.already_there),
    tags_removed: payload.tags_removed ?? 0,
    task,
  };
}

const TASK_MEDIA_BUCKET = 'task-media';

async function createCircle(db: SupabaseClient, userId: string, input: CircleCreate): Promise<Circle> {
  // Same insert as src/data/spaces.ts useCreateSpace: client id, no returning
  // read. on_space_created adds the owner membership. is_default stays false,
  // so this is never a second personal circle.
  const id = crypto.randomUUID();
  const { error } = await db.from('spaces').insert({
    id,
    name: input.name,
    color: input.color,
    owner_id: userId,
  });
  throwIf(error);

  const { data, error: readError } = await db
    .from('space_members')
    .select('role, space:spaces(id,name,color,is_default)')
    .eq('space_id', id)
    .eq('user_id', userId)
    .maybeSingle();
  throwIf(readError);
  const space = one(
    data?.space as { id: string; name: string; color?: string; is_default?: boolean } | {
      id: string;
      name: string;
      color?: string;
      is_default?: boolean;
    }[] | null,
  );
  if (!data || !space || data.role !== 'owner') {
    throw new TroveError('Circle was created but you were not added as the owner.');
  }
  return {
    id: space.id,
    name: space.name,
    color: typeof space.color === 'string' ? space.color : input.color,
    role: 'owner',
    is_personal: Boolean(space.is_default),
    open_task_count: 0,
  };
}

async function addTaskAttachment(
  db: SupabaseClient,
  userId: string,
  input: AttachmentWrite,
): Promise<AttachmentRecord> {
  const path = taskMediaPath(input.spaceId, input.taskId, input.extension, crypto.randomUUID());
  const body = input.bytes.buffer.slice(
    input.bytes.byteOffset,
    input.bytes.byteOffset + input.bytes.byteLength,
  ) as ArrayBuffer;
  const { error: uploadError } = await db.storage.from(TASK_MEDIA_BUCKET).upload(path, body, {
    contentType: input.contentType,
    upsert: false,
  });
  throwIf(uploadError);

  const { data, error } = await db
    .from('task_attachments')
    .insert({
      task_id: input.taskId,
      space_id: input.spaceId,
      path,
      media_type: input.mediaType,
      created_by: userId,
    })
    .select('id, created_at')
    .single();
  if (error || !data) {
    await db.storage.from(TASK_MEDIA_BUCKET).remove([path]);
    throwIf(error);
    throw new TroveError('The file was uploaded but the attachment row was not saved.');
  }
  return {
    id: data.id,
    task_id: input.taskId,
    circle_id: input.spaceId,
    path,
    media_type: input.mediaType,
    content_type: input.contentType,
    byte_length: input.bytes.byteLength,
    created_at: data.created_at,
  };
}

async function createInvite(
  db: SupabaseClient,
  userId: string,
  input: { circleId: string; email: string; role: 'admin' | 'member' | 'viewer'; isAgent?: boolean },
): Promise<InviteResult> {
  const { data, error } = await db
    .from('invites')
    .insert({
      space_id: input.circleId,
      email: input.email,
      role: input.role,
      invited_by: userId,
      is_agent: input.isAgent === true,
    })
    .select('id, email, role, token, expires_at, space_id, is_agent')
    .single();
  if (error?.code === '23505') {
    throw new TroveError('An invite is already pending for that email in this circle.');
  }
  throwIf(error);
  return {
    id: data.id,
    circle_id: data.space_id,
    email: data.email,
    role: data.role as InviteResult['role'],
    is_agent: Boolean(data.is_agent),
    token: data.token,
    expires_at: data.expires_at,
    url: inviteUrl(data.token, Deno.env.get('TROVE_SITE_URL') ?? DEFAULT_SITE_URL),
  };
}

async function replaceTags(db: SupabaseClient, taskId: string, circleId: string, tags: string[]): Promise<void> {
  const { error: deleteError } = await db.from('task_labels').delete().eq('task_id', taskId);
  throwIf(deleteError);
  if (!tags.length) return;

  const { data: existing, error } = await db.from('labels').select('id, name').eq('space_id', circleId);
  throwIf(error);
  const byName = new Map((existing ?? []).map((label) => [label.name.toLowerCase(), label.id]));
  const labelIds: string[] = [];

  for (const tag of tags) {
    const key = tag.toLowerCase();
    let labelId = byName.get(key);
    if (!labelId) {
      const { data: created, error: insertError } = await db
        .from('labels')
        .insert({ space_id: circleId, name: tag, color: 'sage' })
        .select('id')
        .single();
      throwIf(insertError);
      labelId = created.id;
      byName.set(key, labelId);
    }
    labelIds.push(labelId);
  }

  const { error: linkError } = await db
    .from('task_labels')
    .insert(labelIds.map((labelId) => ({ task_id: taskId, label_id: labelId })));
  throwIf(linkError);
}

function assigneesOf(links: TaskRow['assignees']): TaskRecord['assignees'] {
  const people = (links ?? []).flatMap((link) => {
    const profile = one(link.profile);
    if (!profile) return [];
    return [{ user_id: profile.id, display_name: profile.display_name, position: link.position ?? 0 }];
  });
  people.sort((a, b) => a.position - b.position || a.user_id.localeCompare(b.user_id));
  return people.map(({ user_id, display_name }) => ({ user_id, display_name }));
}

function toTask(row: TaskRow): TaskRecord {
  const space = one(row.space);
  const assignees = assigneesOf(row.assignees);
  const primary = assignees[0] ?? null;
  const tags = (row.task_labels ?? []).flatMap((link) => {
    const label = one(link.label);
    return label?.name ? [label.name] : [];
  });
  return {
    id: row.id,
    title: row.title,
    notes: row.description,
    status: row.status as Status,
    priority: (row.priority as TaskRecord['priority']) ?? null,
    rank: row.rank,
    due_date: row.due_date,
    circle_id: row.space_id,
    circle_name: space?.name ?? '',
    assignee_id: primary?.user_id ?? null,
    assignee_name: primary?.display_name ?? null,
    assignees,
    tags,
    external_id: row.external_id,
    repeat_unit: isRepeatUnit(row.repeat_unit) ? row.repeat_unit : null,
    repeat_interval:
      typeof row.repeat_interval === 'number' && Number.isInteger(row.repeat_interval) ? row.repeat_interval : 1,
    repeat_weekday: typeof row.repeat_weekday === 'number' ? row.repeat_weekday : null,
    recurrence_series_id: row.recurrence_series_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function roleInCircle(
  db: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<Role | null> {
  const { data, error } = await db
    .from('space_members')
    .select('role')
    .eq('space_id', spaceId)
    .eq('user_id', userId)
    .maybeSingle();
  throwIf(error);
  return (data?.role as Role | undefined) ?? null;
}

async function ranksInCircle(db: SupabaseClient, spaceId: string): Promise<string[]> {
  const { data, error } = await db.from('tasks').select('rank').eq('space_id', spaceId);
  throwIf(error);
  return (data ?? [])
    .map((row) => (row as { rank?: string | null }).rank ?? '')
    .filter((rank) => rank.length > 0);
}

/** Same placement as src/lib/rank.ts. Ranks are the whole circle, not one due date. */
function rankForPriority(priority: Priority | null, groupRanks: string[]): string {
  const ranks = groupRanks.filter((rank) => rank.length > 0).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (ranks.length === 0) return generateKeyBetween(null, null);
  const lowest = ranks[0];
  const highest = ranks[ranks.length - 1];
  if (priority === 'high') return generateKeyBetween(highest, null);
  if (priority !== 'medium') return generateKeyBetween(null, lowest);
  const mid = Math.floor(ranks.length / 2);
  const lower = ranks[Math.max(0, mid - 1)];
  const upper = ranks[mid];
  if (lower === upper) return generateKeyBetween(null, upper);
  return generateKeyBetween(lower, upper);
}

function isRepeatUnit(value: string | null | undefined): value is RepeatUnit {
  return value === 'day' || value === 'week' || value === 'month';
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function throwIf(error: { message: string; code?: string } | null): asserts error is null {
  if (!error) return;
  if (/row-level security|permission denied/i.test(error.message)) {
    throw new TroveError('You do not have permission to do that.');
  }
  throw new TroveError(error.message);
}
