import { compareRank, rankAtBottom } from './rank';

/**
 * Today is a private, per-user checklist. Each local date has its own list.
 * Tomorrow can be planned the evening before without preparing that day.
 * The database function ensure_today is the source of truth for materialising
 * a day; planTodayMaterialisation mirrors that decision so tests can lock it.
 *
 * Bit 0 is Sunday, matching JavaScript getUTCDay() and Postgres extract(dow).
 * 127 is every day. 62 is Monday–Friday.
 */

export const TODAY_VIEW_ID = 'today';

export const TODAY_TEXT_MAX = 4000;

export const EVERY_DAY = 127;
export const WEEKDAYS = 62;

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Monday-first, for the day picker. Values are the Sunday-based weekday index. */
export const WEEKDAY_PICKER_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDay(value: string): string | null {
  const match = DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}

/** 0 = Sunday … 6 = Saturday. Null when the value is not a real date. */
export function weekdayIndex(iso: string): number | null {
  const parsed = parseDay(iso);
  if (!parsed) return null;
  const [year, month, day] = parsed.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).getUTCDay();
}

/** Bit for that calendar date. Sunday is 1. */
export function weekdayBit(iso: string): number | null {
  const index = weekdayIndex(iso);
  if (index === null) return null;
  return 1 << index;
}

export function dayMatches(days: number, iso: string): boolean {
  const bit = weekdayBit(iso);
  if (bit === null) return false;
  return (days & bit) !== 0;
}

export function isRepeatMask(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= EVERY_DAY;
}

export function daysFromWeekdays(indexes: readonly number[]): number {
  return indexes.reduce((mask, index) => (index >= 0 && index <= 6 ? mask | (1 << index) : mask), 0);
}

/** Selected weekday indexes, Monday-first. */
export function weekdaysFromDays(days: number): number[] {
  return WEEKDAY_PICKER_ORDER.filter((index) => (days & (1 << index)) !== 0);
}

export function repeatLabel(days: number): string {
  if (days === EVERY_DAY) return 'Every day';
  if (days === WEEKDAYS) return 'Weekdays';
  const names = weekdaysFromDays(days).map((index) => WEEKDAY_SHORT[index]);
  return names.length > 0 ? names.join(', ') : 'Doesn’t repeat';
}

/** Calendar arithmetic on a YYYY-MM-DD date. Negative amounts step backward. */
export function shiftDay(iso: string, amount: number): string {
  const parsed = parseDay(iso);
  if (!parsed) throw new Error('day must be YYYY-MM-DD');
  const [year, month, day] = parsed.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + amount);
  const monthText = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const dayText = `${date.getUTCDate()}`.padStart(2, '0');
  return `${date.getUTCFullYear()}-${monthText}-${dayText}`;
}

/** The device-local calendar date, which is the day the app asks the database for. */
export function localToday(now = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export type TodaySourceItem = {
  id: string;
  day: string;
  routineId: string | null;
  checked: boolean;
  /** Higher keys sort first. Used to keep rolled lines in their old order. */
  rank: string;
};

/** A day after the person's local today is a plan, and must not be prepared. */
export function shouldPrepareDay(day: string, asOf: string): boolean {
  return day <= asOf;
}

/**
 * Ranks for unticked one-offs that move onto a day which already has lines.
 * `movedHighestFirst` is the previous top-to-bottom order. Each new key sits
 * under `existingLowest`, so the rolled lines follow routines and plans.
 * An empty destination keeps the old ranks.
 */
export function rolloverRanks(
  existingLowest: string | null,
  movedHighestFirst: readonly { id: string; rank: string }[],
): { id: string; rank: string }[] {
  if (!existingLowest) {
    return movedHighestFirst.map((line) => ({ id: line.id, rank: line.rank }));
  }
  let floor = existingLowest;
  return movedHighestFirst.map((line) => {
    floor = rankAtBottom(floor);
    return { id: line.id, rank: floor };
  });
}

/** Active routines due on this weekday that are not already stored as rows. */
export function previewRoutineIds(
  day: string,
  presentRoutineIds: readonly string[],
  routines: readonly TodayRoutinePlan[],
): string[] {
  const present = new Set(presentRoutineIds);
  return routines
    .filter((routine) => routine.active && dayMatches(routine.days, day) && !present.has(routine.id))
    .map((routine) => routine.id);
}

export type TodayRoutinePlan = {
  id: string;
  text: string | null;
  taskId: string | null;
  days: number;
  rank: string;
  active: boolean;
};

export type PlannedRoutineLine = {
  text: string | null;
  taskId: string | null;
  routineId: string;
  rank: string;
};

export type PlannedToday = {
  /**
   * Unticked one-off rows that move onto this day. Repeating lines and ticked
   * lines stay where they are. Empty when a later day is already prepared, so
   * reading an earlier date cannot pull lines backward.
   */
  moveIds: string[];
  routines: PlannedRoutineLine[];
};

/**
 * What ensure_today inserts or moves the first time a day is opened.
 * Returns null when that day was already prepared.
 *
 * One-offs move (they do not stay behind as a second copy) from the most
 * recent earlier day that already has rows. moveIds are that group's previous
 * top-to-bottom order; they are placed under lines already on the day.
 * A later prepared day blocks that move. Active routines scheduled for this
 * weekday are added at their saved ranks. A routine already stored is skipped.
 */
export function planTodayMaterialisation(input: {
  day: string;
  alreadyMaterialised: boolean;
  laterDayMaterialised: boolean;
  earlierItems: readonly TodaySourceItem[];
  routines: readonly TodayRoutinePlan[];
}): PlannedToday | null {
  if (input.alreadyMaterialised) return null;
  const sourceDay = input.earlierItems.reduce<string | null>((latest, item) => {
    if (item.day >= input.day) return latest;
    if (latest === null || item.day > latest) return item.day;
    return latest;
  }, null);
  const moveIds =
    input.laterDayMaterialised || sourceDay === null
      ? []
      : input.earlierItems
          .filter((item) => item.day === sourceDay && item.routineId === null && !item.checked)
          .sort((a, b) => compareRank(a.rank, b.rank) || a.id.localeCompare(b.id))
          .map((item) => item.id);
  const routines = input.routines
    .filter((routine) => routine.active && dayMatches(routine.days, input.day))
    .map((routine) => ({
      text: routine.text,
      taskId: routine.taskId,
      routineId: routine.id,
      rank: routine.rank,
    }));
  return { moveIds, routines };
}

export type TodayLine = {
  id: string;
  day: string;
  text: string | null;
  taskId: string | null;
  taskTitle: string | null;
  taskStatus: string | null;
  spaceId: string | null;
  spaceName: string | null;
  spaceColor: string | null;
  routineId: string | null;
  /** Bitmask when this line is still tied to a routine, including a paused one. */
  repeatDays: number | null;
  routineActive: boolean;
  rank: string;
  checkedAt: string | null;
  createdAt: string;
  /** Drawn from the routine schedule. Not a stored row, so it is not ticked. */
  virtual?: boolean;
};

export function todayLineTitle(line: Pick<TodayLine, 'text' | 'taskTitle'>): string {
  const title = line.taskTitle?.trim() || line.text?.trim();
  return title || 'Task removed';
}

/**
 * Lines ticked on this calendar day. Free-text lines and linked tasks both
 * count once checked_at is set. Routine previews are not stored ticks.
 * The number follows the day, so it starts again tomorrow without its own table.
 */
export function momentumCount(
  lines: readonly Pick<TodayLine, 'day' | 'checkedAt' | 'virtual'>[],
  day: string,
): number {
  let count = 0;
  for (const line of lines) {
    if (line.virtual || line.day !== day || !line.checkedAt) continue;
    count += 1;
  }
  return count;
}

export function todayLineRepeats(line: Pick<TodayLine, 'routineId' | 'routineActive'>): boolean {
  return line.routineId !== null && line.routineActive;
}
