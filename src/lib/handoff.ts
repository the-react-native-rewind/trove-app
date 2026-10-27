import type { TaskAssignee } from './types';

export type HandoffStatus = 'todo' | 'in_progress';

/** One handoff, newest first when listed. Names are null once that person has left. */
export type TaskHandoff = {
  id: string;
  from_user_id: string | null;
  from_name: string | null;
  from_avatar_url: string | null;
  to_user_id: string | null;
  to_name: string | null;
  to_avatar_url: string | null;
  status: HandoffStatus;
  note: string | null;
  note_edited_at: string | null;
  created_at: string;
};

type HandoffPerson = { id: string };

/**
 * The note shown on a task row. Hidden once the task is done, or once the
 * recipient is no longer assigned. Detail still shows the history.
 */
export function visibleHandoffNote(task: {
  status: string;
  assignees: readonly HandoffPerson[];
  latest_handoff: { note: string | null; to_user_id: string | null } | null | undefined;
}): string | null {
  const handoff = task.latest_handoff;
  const note = handoff?.note?.trim() ?? '';
  if (!note) return null;
  if (task.status === 'done') return null;
  if (!handoff?.to_user_id) return null;
  if (!task.assignees.some((person) => person.id === handoff.to_user_id)) return null;
  return note;
}

export type AssigneeTap = 'remove' | 'add' | 'prompt';

/**
 * Tapping someone in the edit-screen picker. Prompt only when the task is
 * yours, still open, and the person is someone else who is not already on it.
 */
export function assigneeTap(input: {
  callerIsAssignee: boolean;
  taskDone: boolean;
  tappedId: string;
  callerId: string | null;
  alreadySelected: boolean;
}): AssigneeTap {
  if (input.alreadySelected) return 'remove';
  if (
    input.callerIsAssignee &&
    !input.taskDone &&
    input.callerId != null &&
    input.tappedId !== input.callerId
  ) {
    return 'prompt';
  }
  return 'add';
}

/** Hand off is offered on an open task you are assigned to, when someone else is in the circle. */
export function canHandOff(input: {
  callerId: string | null;
  writable: boolean;
  status: string;
  assigneeIds: readonly string[];
  otherMemberCount: number;
}): boolean {
  if (!input.callerId || !input.writable) return false;
  if (input.status === 'done') return false;
  if (input.otherMemberCount < 1) return false;
  return input.assigneeIds.includes(input.callerId);
}

/** Short age for "Handed over by Luke · 2h ago". */
export function formatHandoffAge(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function handoffStatusLabel(status: string): string {
  return status === 'in_progress' ? 'In progress' : 'Not started';
}

export type HandoffCacheInput = {
  taskId: string;
  callerId: string;
  toUserId: string;
  toName: string;
  toAvatarUrl: string | null;
  fromName: string | null;
  fromAvatarUrl: string | null;
  status: HandoffStatus;
  note: string | null;
};

type CachedAssignee = TaskAssignee;

type CachedTask = {
  id: string;
  status: string;
  assignees: CachedAssignee[];
  latest_handoff?: TaskHandoff | null;
};

/**
 * Optimistic handoff. The recipient takes the caller's place unless they
 * were already assigned, in which case they keep their own place.
 * Mine passes dropIfCallerGone so the task leaves that list immediately.
 */
export function applyHandoffToCache(
  data: unknown,
  input: HandoffCacheInput,
  dropIfCallerGone: boolean,
): unknown {
  if (Array.isArray(data)) {
    const next = data.map((item) => applyHandoffToCache(item, input, false));
    if (!dropIfCallerGone) return next;
    return next.filter((item) => {
      if (!item || typeof item !== 'object' || !('id' in item)) return true;
      if ((item as { id: string }).id !== input.taskId) return true;
      const assignees = (item as { assignees?: { id: string }[] }).assignees ?? [];
      return assignees.some((person) => person.id === input.callerId);
    });
  }
  if (!data || typeof data !== 'object' || !('id' in data) || !('assignees' in data)) return data;
  const task = data as CachedTask;
  if (task.id !== input.taskId || !Array.isArray(task.assignees)) return data;
  const callerIndex = task.assignees.findIndex((person) => person.id === input.callerId);
  const without = task.assignees.filter((person) => person.id !== input.callerId);
  const already = without.some((person) => person.id === input.toUserId);
  const assignees = already
    ? without
    : (() => {
        const inserted = [...without];
        inserted.splice(Math.max(0, callerIndex), 0, {
          id: input.toUserId,
          display_name: input.toName,
          avatar_url: input.toAvatarUrl,
        });
        return inserted;
      })();
  return {
    ...task,
    status: input.status,
    assignees,
    latest_handoff: {
      id: `optimistic-${input.taskId}`,
      from_user_id: input.callerId,
      from_name: input.fromName,
      from_avatar_url: input.fromAvatarUrl,
      to_user_id: input.toUserId,
      to_name: input.toName,
      to_avatar_url: input.toAvatarUrl,
      status: input.status,
      note: input.note,
      note_edited_at: null,
      created_at: new Date().toISOString(),
    },
  };
}

type ProfileEmbed = {
  id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
};

function oneProfile(value: unknown): ProfileEmbed | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;
  const profile = row as ProfileEmbed;
  if (!profile.id) return null;
  return profile;
}

/** PostgREST may return the latest handoff as one object or a one-item list. */
export function normalizeLatestHandoff(raw: unknown): TaskHandoff | null {
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const sorted = [...rows].filter((row) => row && typeof row === 'object');
  sorted.sort((a, b) => {
    const left = String((a as { created_at?: string }).created_at ?? '');
    const right = String((b as { created_at?: string }).created_at ?? '');
    return left < right ? 1 : left > right ? -1 : 0;
  });
  const row = sorted[0] as
    | {
        id?: string;
        from_user_id?: string | null;
        to_user_id?: string | null;
        status?: string;
        note?: string | null;
        note_edited_at?: string | null;
        created_at?: string;
        from_profile?: unknown;
        to_profile?: unknown;
      }
    | undefined;
  if (!row?.id || !row.created_at) return null;
  const from = oneProfile(row.from_profile);
  const to = oneProfile(row.to_profile);
  const status: HandoffStatus = row.status === 'in_progress' ? 'in_progress' : 'todo';
  return {
    id: row.id,
    from_user_id: row.from_user_id ?? from?.id ?? null,
    from_name: from?.display_name ?? null,
    from_avatar_url: from?.avatar_url ?? null,
    to_user_id: row.to_user_id ?? to?.id ?? null,
    to_name: to?.display_name ?? null,
    to_avatar_url: to?.avatar_url ?? null,
    status,
    note: row.note?.trim() ? row.note.trim() : null,
    note_edited_at: row.note_edited_at ?? null,
    created_at: row.created_at,
  };
}

export function normalizeLogCount(raw: unknown): number {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object' || !('count' in row)) return 0;
  const count = (row as { count?: unknown }).count;
  return typeof count === 'number' ? count : 0;
}
