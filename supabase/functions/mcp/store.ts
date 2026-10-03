// User-scoped data access. Every query uses the caller's JWT, so existing
// RLS policies decide what they can see and change. move_task is the
// security-definer RPC from migration 0011.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { generateKeyBetween } from 'npm:fractional-indexing@3.2.0';

import {
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

const TASK_SELECT =
  'id, title, description, status, priority, rank, due_date, space_id, assignee_id, external_id, repeat_unit, repeat_interval, repeat_weekday, recurrence_series_id, created_at, updated_at, space:spaces(id,name), assignee:profiles!tasks_assignee_id_fkey(id,display_name), task_labels(label:labels(name))';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  rank: string;
  due_date: string | null;
  space_id: string;
  assignee_id: string | null;
  external_id: string | null;
  repeat_unit: string | null;
  repeat_interval: number | null;
  repeat_weekday: number | null;
  recurrence_series_id: string | null;
  created_at: string;
  updated_at: string;
  space: { id: string; name: string } | { id: string; name: string }[] | null;
  assignee: { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null;
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
    updateTask: (id, patch) => updateTask(db, id, patch),
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
    .select('user_id, role, profile:profiles(display_name)')
    .eq('space_id', circleId)
    .order('created_at', { ascending: true });
  throwIf(error);
  return (data ?? []).map((row) => {
    const profile = one(row.profile as { display_name: string | null } | { display_name: string | null }[] | null);
    return {
      user_id: row.user_id,
      display_name: profile?.display_name ?? null,
      role: row.role as Role,
    };
  });
}

async function listTasks(db: SupabaseClient, filter: TaskFilter): Promise<TaskRecord[]> {
  let query = db.from('tasks').select(TASK_SELECT);
  if (filter.circleId) query = query.eq('space_id', filter.circleId);
  if (filter.assigneeId) query = query.eq('assignee_id', filter.assigneeId);
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.dueOn) query = query.eq('due_date', filter.dueOn);
  if (filter.dueBefore) query = query.lte('due_date', filter.dueBefore);
  if (filter.dueAfter) query = query.gte('due_date', filter.dueAfter);
  const { data, error } = await query
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('rank', { ascending: false })
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
  const ranks = await ranksInGroup(db, input.circleId, input.dueDate);
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
      assignee_id: input.assigneeId,
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
  return (await getTask(db, task.id)) ?? task;
}

async function updateTask(db: SupabaseClient, id: string, patch: TaskPatch): Promise<TaskRecord | null> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.notes !== undefined) row.description = patch.notes;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.priority !== undefined) {
    const current = await getTask(db, id);
    if (!current) return null;
    const due = patch.dueDate !== undefined ? patch.dueDate : current.due_date;
    const ranks = (await ranksInGroup(db, current.circle_id, due)).filter((rank) => rank !== current.rank);
    row.priority = patch.priority;
    row.rank = rankForPriority(patch.priority, ranks);
  }
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;
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

  return getTask(db, id);
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
  input: { circleId: string; email: string; role: 'admin' | 'member' | 'viewer' },
): Promise<InviteResult> {
  const { data, error } = await db
    .from('invites')
    .insert({
      space_id: input.circleId,
      email: input.email,
      role: input.role,
      invited_by: userId,
    })
    .select('id, email, role, token, expires_at, space_id')
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
    token: data.token,
    expires_at: data.expires_at,
    url: `trove://invite/${data.token}`,
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

function toTask(row: TaskRow): TaskRecord {
  const space = one(row.space);
  const assignee = one(row.assignee);
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
    assignee_id: row.assignee_id,
    assignee_name: assignee?.display_name ?? null,
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

async function ranksInGroup(
  db: SupabaseClient,
  spaceId: string,
  dueDate: string | null,
): Promise<string[]> {
  let query = db.from('tasks').select('rank').eq('space_id', spaceId);
  query = dueDate ? query.eq('due_date', dueDate) : query.is('due_date', null);
  const { data, error } = await query;
  throwIf(error);
  return (data ?? [])
    .map((row) => (row as { rank?: string | null }).rank ?? '')
    .filter((rank) => rank.length > 0);
}

/** Same placement as src/lib/rank.ts. Kept here so the edge function can import the Deno package. */
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
