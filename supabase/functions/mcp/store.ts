// User-scoped data access. Every query uses the caller's JWT, so existing
// RLS policies decide what they can see and change. move_task is the
// security-definer RPC from migration 0011.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

import {
  TroveError,
  type Circle,
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
} from '../../../src/lib/mcpTools.ts';
import { readEnv, userClient } from './auth.ts';

const TASK_SELECT =
  'id, title, description, status, priority, due_date, space_id, assignee_id, external_id, created_at, updated_at, space:spaces(id,name), assignee:profiles!tasks_assignee_id_fkey(id,display_name), task_labels(label:labels(name))';

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  space_id: string;
  assignee_id: string | null;
  external_id: string | null;
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
    listCircles: () => listCircles(db, userId),
    listMembers: (circleId) => listMembers(db, circleId),
    listTasks: (filter) => listTasks(db, filter),
    getTask: (id) => getTask(db, id),
    findByExternalId: (externalId) => findByExternalId(db, userId, externalId),
    insertTask: (input) => insertTask(db, userId, input),
    updateTask: (id, patch) => updateTask(db, id, patch),
    moveTask: (taskId, targetCircleId) => moveTask(db, taskId, targetCircleId),
    createInvite: (input) => createInvite(db, userId, input),
  };
}

async function listCircles(db: SupabaseClient, userId: string): Promise<Circle[]> {
  const { data: memberships, error } = await db
    .from('space_members')
    .select('role, space:spaces(id,name,color,is_default)')
    .eq('user_id', userId);
  throwIf(error);

  const { data: openTasks, error: taskError } = await db.from('tasks').select('space_id').neq('status', 'done');
  throwIf(taskError);

  const counts = new Map<string, number>();
  for (const task of openTasks ?? []) {
    counts.set(task.space_id, (counts.get(task.space_id) ?? 0) + 1);
  }

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
  const { data, error } = await db
    .from('tasks')
    .insert({
      space_id: input.circleId,
      title: input.title,
      description: input.notes,
      status: input.status,
      priority: input.priority,
      due_date: input.dueDate,
      assignee_id: input.assigneeId,
      external_id: input.externalId,
      created_by: userId,
      position: input.position,
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
  if (patch.priority !== undefined) row.priority = patch.priority;
  if (patch.dueDate !== undefined) row.due_date = patch.dueDate;
  if (patch.assigneeId !== undefined) row.assignee_id = patch.assigneeId;

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
    due_date: row.due_date,
    circle_id: row.space_id,
    circle_name: space?.name ?? '',
    assignee_id: row.assignee_id,
    assignee_name: assignee?.display_name ?? null,
    tags,
    external_id: row.external_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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
