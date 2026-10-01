/**
 * The personal view ("Mine") is every task assigned to the signed-in person,
 * across every group they belong to. A group's own board is unfiltered:
 * members see that group's whole list. Row-level security still limits both
 * queries to spaces the person has joined.
 */
export const MINE_VIEW_ID = 'all';

export function isAssignedToUser(
  assigneeId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  return !!userId && assigneeId === userId;
}
