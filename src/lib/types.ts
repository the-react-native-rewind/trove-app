import type { Database } from './database.types';

type Tables = Database['public']['Tables'];

export type Profile = Tables['profiles']['Row'];
export type Space = Tables['spaces']['Row'];
export type SpaceMember = Tables['space_members']['Row'];
export type Task = Tables['tasks']['Row'];
export type Label = Tables['labels']['Row'];
export type Invite = Tables['invites']['Row'];

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';
export type SpaceRole = 'owner' | 'admin' | 'member' | 'viewer';
export type Priority = 'low' | 'medium' | 'high';

export const STATUSES: { key: TaskStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'Doing' },
  { key: 'done', label: 'Done' },
];

/** A space the current user belongs to, with their role and open-task count. */
export type SpaceWithMeta = Space & {
  role: SpaceRole;
  openCount: number;
};

/** A task joined with its space (name + color) and assignee profile. */
export type TaskWithRefs = Task & {
  space: Pick<Space, 'id' | 'name' | 'color'> | null;
  assignee: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

/** A roster entry: membership joined with the member's profile. */
export type RosterMember = SpaceMember & {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'> | null;
};

export const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

export function canWrite(role: SpaceRole | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'member';
}

export function canManage(role: SpaceRole | undefined): boolean {
  return role === 'owner' || role === 'admin';
}
