/** Sentinel for the circle-board filter that shows tasks with nobody assigned. */
export const UNASSIGNED_FILTER = '__unassigned__';

export function isAssignedToUser(
  assigneeIds: readonly string[],
  userId: string | null | undefined,
): boolean {
  return !!userId && assigneeIds.includes(userId);
}

/** Empty selection shows every task. Otherwise match any selected person, or nobody. */
export function taskMatchesAssigneeFilter(
  assigneeIds: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  if (assigneeIds.length === 0) return selected.has(UNASSIGNED_FILTER);
  return assigneeIds.some((id) => selected.has(id));
}

export type AssigneeLink = {
  position?: number | null;
  profile?:
    | { id: string; display_name: string | null; avatar_url: string | null }
    | { id: string; display_name: string | null; avatar_url: string | null }[]
    | null;
};

export type NormalizedAssignee = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

/** Turn the task_assignees embed into people, first assignee first. */
export function normalizeAssignees(links: readonly AssigneeLink[] | null | undefined): NormalizedAssignee[] {
  const people = (links ?? []).flatMap((link) => {
    const profile = Array.isArray(link.profile) ? link.profile[0] : link.profile;
    if (!profile) return [];
    return [{ profile, position: link.position ?? 0 }];
  });
  people.sort(
    (a, b) => a.position - b.position || a.profile.id.localeCompare(b.profile.id),
  );
  return people.map((item) => item.profile);
}
