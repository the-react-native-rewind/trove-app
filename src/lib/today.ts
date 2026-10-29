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
  /**
   * Taken off that day. The row stays so it does not roll forward and a
   * routine is not inserted again. The linked task is unchanged.
   */
  dismissed?: boolean;
  /** Higher keys sort first. Used to keep rolled lines in their old order. */
  rank: string;
};

/**
 * Tomorrow and Not today apply to a stored, unticked line. A tick is history
 * for that day. A routine preview is not a row yet.
 */
export function canRescheduleTodayLine(line: {
  checkedAt: string | null;
  virtual?: boolean;
}): boolean {
  return line.checkedAt === null && !line.virtual;
}

/** The open plan line for a task on this list, if the person can move it. */
export function openTodayLineForTask(
  lines: readonly TodayLine[],
  taskId: string,
): TodayLine | null {
  return lines.find((line) => line.taskId === taskId && canRescheduleTodayLine(line)) ?? null;
}

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
 * A later prepared day blocks that move. A line taken off its day
 * (dismissed) stays there and does not roll. Active routines scheduled for
 * this weekday are added at their saved ranks. A routine already stored,
 * including one that was taken off, is skipped.
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
          .filter(
            (item) => item.day === sourceDay && item.routineId === null && !item.checked && !item.dismissed,
          )
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

/** Semitones above the recorded ding. The first tick stays at the original pitch. */
export const MOMENTUM_MAX_SEMITONES = 7;

/** Each tick grows the badge by this fraction, up to MOMENTUM_MAX_SCALE_STEPS. */
export const MOMENTUM_SCALE_STEP = 0.05;
export const MOMENTUM_MAX_SCALE_STEPS = 8;

/**
 * Pitch step for the chime. Count 0 and 1 play the original recording.
 * Each further tick rises one semitone. Unticking lowers the count, so the
 * next ding steps back down. Capped a fifth above the recording.
 */
export function momentumSemitones(count: number): number {
  const ticks = Number.isFinite(count) ? Math.floor(count) : 0;
  if (ticks <= 1) return 0;
  return Math.min(MOMENTUM_MAX_SEMITONES, ticks - 1);
}

/** Playback rate that raises pitch by `momentumSemitones` when pitch correction is off. */
export function momentumPlaybackRate(count: number): number {
  return 2 ** (momentumSemitones(count) / 12);
}

/** Layout scale for the momentum circle. 1 at zero, then +5% per tick up to +40%. */
export function momentumScale(count: number): number {
  const ticks = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return 1 + MOMENTUM_SCALE_STEP * Math.min(MOMENTUM_MAX_SCALE_STEPS, ticks);
}

export type MomentumScheme = 'light' | 'dark';

export type MomentumAppearance = {
  /** Number colour. Muted at zero, then warmer through the accent palette. */
  ink: string;
  /** Badge fill paired with `ink` so the pair stays legible in that scheme. */
  fill: string;
};

const MOMENTUM_LIGHT_FILL = '#E7ECDD';
const MOMENTUM_DARK_FILL = '#243026';

/** Darkened accents. Each step is more saturated, and each clears 4.5:1 on the light fill. */
const MOMENTUM_LIGHT_INK = [
  '#5E564C',
  '#3E5C36',
  '#1F6B45',
  '#0F655C',
  '#8A5410',
  '#9C4E12',
  '#B8432A',
  '#9E342E',
] as const;

/** Light accents for a deep fill. Muted oat at zero, then sage, teal, honey, terracotta. */
const MOMENTUM_DARK_INK = [
  '#E4D9C8',
  '#D5E4C4',
  '#B7E0A4',
  '#8ED9C4',
  '#F0D078',
  '#F2C14B',
  '#F2A36A',
  '#F4B2A8',
] as const;

function momentumInkIndex(count: number): number {
  const ticks = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return Math.min(MOMENTUM_LIGHT_INK.length - 1, ticks);
}

/** Number and fill for the momentum badge. Zero is muted and still readable. */
export function momentumAppearance(count: number, scheme: MomentumScheme): MomentumAppearance {
  const index = momentumInkIndex(count);
  if (scheme === 'dark') {
    return { ink: MOMENTUM_DARK_INK[index] ?? MOMENTUM_DARK_INK[0], fill: MOMENTUM_DARK_FILL };
  }
  return { ink: MOMENTUM_LIGHT_INK[index] ?? MOMENTUM_LIGHT_INK[0], fill: MOMENTUM_LIGHT_FILL };
}

/**
 * A background fetch must not replace the list when an edit started, or a
 * write finished, while that fetch was in flight. The caller keeps the cache.
 */
export function preferFreshTodayLines<T>(input: {
  startedGeneration: number;
  currentGeneration: number;
  startedSettled: number;
  currentSettled: number;
  editsInFlight: number;
  fetched: T;
  cached: T | undefined;
}): T {
  const stale =
    input.startedGeneration !== input.currentGeneration ||
    input.startedSettled !== input.currentSettled ||
    input.editsInFlight > 0;
  if (stale && input.cached !== undefined) return input.cached;
  return input.fetched;
}

function checkedFlag(line: Pick<TodayLine, 'checkedAt'>): boolean {
  return line.checkedAt !== null;
}

/**
 * Same row for the list. Checked is boolean, so a server timestamp that
 * differs from the optimistic one does not count as a new row.
 */
export function todayLineVisuallyEqual(a: TodayLine, b: TodayLine): boolean {
  return (
    a.id === b.id &&
    a.day === b.day &&
    a.text === b.text &&
    a.taskId === b.taskId &&
    a.taskTitle === b.taskTitle &&
    a.taskStatus === b.taskStatus &&
    a.spaceName === b.spaceName &&
    a.spaceColor === b.spaceColor &&
    a.routineId === b.routineId &&
    a.repeatDays === b.repeatDays &&
    a.routineActive === b.routineActive &&
    a.rank === b.rank &&
    checkedFlag(a) === checkedFlag(b) &&
    Boolean(a.virtual) === Boolean(b.virtual)
  );
}

/**
 * Keep the current row objects when a refetch comes back in the same order.
 * A new array with the same ids still returns the previous reference when
 * nothing visible changed, so the list does not remount or jump.
 */
export function reconcileTodayLines(current: readonly TodayLine[], incoming: readonly TodayLine[]): TodayLine[] {
  if (current.length !== incoming.length) return incoming.slice();
  for (let index = 0; index < current.length; index += 1) {
    if (current[index]?.id !== incoming[index]?.id) return incoming.slice();
  }
  let changed = false;
  const next = current.map((line, index) => {
    const server = incoming[index];
    if (!server || todayLineVisuallyEqual(line, server)) return line;
    changed = true;
    if (line.checkedAt !== null && server.checkedAt !== null) {
      return { ...server, checkedAt: line.checkedAt };
    }
    return server;
  });
  return changed ? next : (current as TodayLine[]);
}

export function shareTodayLines(oldData: unknown, newData: unknown): unknown {
  if (oldData === newData) return oldData;
  if (!Array.isArray(oldData) || !Array.isArray(newData)) return newData;
  return reconcileTodayLines(oldData as TodayLine[], newData as TodayLine[]);
}

export function withLinePatch(
  lines: readonly TodayLine[],
  id: string,
  patch: Partial<TodayLine>,
): TodayLine[] {
  let changed = false;
  const next = lines.map((line) => {
    if (line.id !== id) return line;
    const updated = { ...line, ...patch };
    if (todayLineVisuallyEqual(line, updated)) return line;
    changed = true;
    return updated;
  });
  return changed ? next : (lines as TodayLine[]);
}

export function withRoutinePatch(
  lines: readonly TodayLine[],
  routineId: string,
  patch: Partial<TodayLine>,
): TodayLine[] {
  let changed = false;
  const next = lines.map((line) => {
    if (line.routineId !== routineId) return line;
    const updated = { ...line, ...patch };
    if (todayLineVisuallyEqual(line, updated)) return line;
    changed = true;
    return updated;
  });
  return changed ? next : (lines as TodayLine[]);
}

export function withoutTodayLine(lines: readonly TodayLine[], id: string): TodayLine[] {
  if (!lines.some((line) => line.id === id)) return lines as TodayLine[];
  return lines.filter((line) => line.id !== id);
}

export function withoutVirtualRoutine(lines: readonly TodayLine[], routineId: string): TodayLine[] {
  if (!lines.some((line) => line.virtual && line.routineId === routineId)) return lines as TodayLine[];
  return lines.filter((line) => !(line.virtual && line.routineId === routineId));
}

function compareTodayLines(a: TodayLine, b: TodayLine): number {
  return compareRank(a.rank, b.rank) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function insertTodayLine(lines: readonly TodayLine[], line: TodayLine): TodayLine[] {
  if (lines.some((item) => item.id === line.id)) return lines as TodayLine[];
  return [...lines, line].sort(compareTodayLines);
}

export function replaceTodayLineId(lines: readonly TodayLine[], fromId: string, toId: string): TodayLine[] {
  if (fromId === toId || !lines.some((line) => line.id === fromId)) return lines as TodayLine[];
  return lines.map((line) => (line.id === fromId ? { ...line, id: toId } : line));
}

/** Rank for a line appended under the current list. Higher keys stay above it. */
export function bottomTodayRank(lines: readonly { rank: string }[]): string {
  let lowest: string | null = null;
  for (const line of lines) {
    if (lowest === null || compareRank(lowest, line.rank) < 0) lowest = line.rank;
  }
  return rankAtBottom(lowest);
}

export function todayLineRepeats(line: Pick<TodayLine, 'routineId' | 'routineActive'>): boolean {
  return line.routineId !== null && line.routineActive;
}
