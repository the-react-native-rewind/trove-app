export type AssignablePerson = {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** People who belong to every roster. Order follows the first circle, by name. */
export function peopleInEveryCircle(rosters: readonly AssignablePerson[][]): AssignablePerson[] {
  if (rosters.length === 0) return [];
  const [first, ...rest] = rosters;
  const seen = new Set<string>();
  const people: AssignablePerson[] = [];
  for (const person of first ?? []) {
    if (seen.has(person.userId)) continue;
    seen.add(person.userId);
    const shared = rest.every((roster) => roster.some((member) => member.userId === person.userId));
    if (shared) people.push(person);
  }
  people.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
  return people;
}

export function uniqueSpaceIds(tasks: readonly { space_id: string }[]): string[] {
  return [...new Set(tasks.map((task) => task.space_id))];
}
