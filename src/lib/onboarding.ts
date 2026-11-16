import { localToday, shiftDay, weekdayIndex } from './today';

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export const WEEKDAY_ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const ALL_DAYS: Weekday[] = [...WEEKDAY_ORDER];
const WORK_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
const WEEKEND_DAYS: Weekday[] = ['sat', 'sun'];

export type OnboardingAction = {
  title: string;
  /** On the day onboarding is planning (today, or tomorrow in the evening). */
  today: boolean;
  due_date: string | null;
};

export type OnboardingRoutine = {
  text: string;
  days: Weekday[];
};

export type OnboardingCircle = {
  /** Which list the circle came from. Its name can be changed; this cannot. */
  source: 'work' | 'home';
  name: string;
  /** A circle accent name from the theme. */
  color: string;
  actions: OnboardingAction[];
  routines: OnboardingRoutine[];
};

export type OnboardingPlan = {
  circles: OnboardingCircle[];
  personal: {
    actions: OnboardingAction[];
    routines: OnboardingRoutine[];
  };
};

/** The four lists onboarding asks for, one line per thing. */
export type OnboardingLists = {
  habits: string[];
  work: string[];
  home: string[];
  other: string[];
};

export type OnboardingCategory = keyof OnboardingLists;

export const ONBOARDING_CATEGORY_ORDER: OnboardingCategory[] = ['habits', 'work', 'home', 'other'];

export const EMPTY_LISTS: OnboardingLists = { habits: [], work: [], home: [], other: [] };

export const ONBOARDING_LINE_MAX = 80;

/** today_routines.days is a 7-bit weekday mask (bit 1<<dow, Sun=0). 127 = daily. */
export function daysToBitmask(days: Weekday[]): number {
  let mask = 0;
  for (const day of days) {
    const index = WEEKDAY_ORDER.indexOf(day);
    if (index >= 0) mask |= 1 << index;
  }
  return mask || 127; // an empty set means "every day" rather than "never"
}

const DAY_LABEL: Record<Weekday, string> = {
  sun: 'Sun',
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
};

/** A short, human cadence for a routine's weekdays. */
export function summariseDays(days: Weekday[]): string {
  const set = new Set(days);
  if (set.size === 0 || set.size === 7) return 'Every day';
  if (WORK_DAYS.every((d) => set.has(d)) && set.size === 5) return 'Weekdays';
  if (WEEKEND_DAYS.every((d) => set.has(d)) && set.size === 2) return 'Weekends';
  return WEEKDAY_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_LABEL[d])
    .join(', ');
}

/** One typed line, tidied: single spaces, a capital to start, no trailing full stop. */
export function cleanLine(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '').trim();
  if (!text) return '';
  // Leave names that start small on purpose alone: "iPhone", "eBay".
  const startsSmallOnPurpose = /^[a-z][A-Z]/.test(text);
  const capped = startsSmallOnPurpose ? text : text.charAt(0).toUpperCase() + text.slice(1);
  return capped.slice(0, ONBOARDING_LINE_MAX).trim();
}

/** Add a line to a list. Blank lines and repeats (ignoring case) change nothing. */
export function addLine(list: readonly string[], raw: string): string[] {
  const line = cleanLine(raw);
  if (!line) return list as string[];
  const key = line.toLowerCase();
  if (list.some((existing) => existing.toLowerCase() === key)) return list as string[];
  return [...list, line];
}

export function removeLine(list: readonly string[], line: string): string[] {
  return list.filter((existing) => existing !== line);
}

// Weekday words, full and short. Group 1 is always the first three letters.
const DAY_WORD =
  '(mon|tue|wed|thu|fri|sat|sun)(?:days?|sdays?|nesdays?|rsdays?|urdays?|s|rs?)?';
const DAY_JOIN = '(?:\\s*(?:,|&|/|\\+|and)\\s*|\\s+)';
const DAY_LEAD = '(?:\\b(?:on|every|each)\\s+)';

const EVERY_DAY_PHRASE = /\b(?:every\s*day|each\s+day|daily)\b/i;
const EVERY_PART_OF_DAY = /\b(?:every|each)\s+(?:morning|evening|night|afternoon)\b/i;
const WEEKDAYS_PHRASE = /\b(?:(?:on|every|each)\s+)?week\s?days?\b/i;
const WEEKENDS_PHRASE = /\b(?:(?:on|every|each|at)\s+)?(?:the\s+)?weekends?\b/i;
const DAY_LIST = new RegExp(`${DAY_LEAD}?\\b${DAY_WORD}\\b(?:${DAY_JOIN}\\b${DAY_WORD}\\b)*`, 'gi');
const FULL_DAY_NAME = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)days?\b/i;

// "3 times a week", "twice a week", "4x per week".
const COUNT_WORD: Record<string, number> = {
  once: 1,
  twice: 2,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};
const TIMES_A_WEEK =
  /\b(once|twice|(?:[1-7]|one|two|three|four|five|six|seven)\s*(?:x|times?))\s*(?:a|per|each|every|\/)?\s*week\b/i;
const WEEKLY = /\bweekly\b/i;

/**
 * Days for "so many times a week", spread across the week. A guess: the line
 * says how often, not when, and the person sets the real days on the next screen.
 */
const SPREAD: Record<number, Weekday[]> = {
  1: ['mon'],
  2: ['mon', 'thu'],
  3: ['mon', 'wed', 'fri'],
  4: ['mon', 'tue', 'thu', 'fri'],
  5: WORK_DAYS,
  6: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
  7: ALL_DAYS,
};

function timesAWeek(phrase: string): number {
  const first = phrase.trim().toLowerCase().match(/^[a-z]+|^[1-7]/)?.[0] ?? '';
  return COUNT_WORD[first] ?? Number(first);
}

function daysIn(phrase: string): Weekday[] {
  const found: Weekday[] = [];
  const each = new RegExp(`\\b${DAY_WORD}\\b`, 'gi');
  for (const match of phrase.matchAll(each)) {
    const day = match[1].toLowerCase() as Weekday;
    if (!found.includes(day)) found.push(day);
  }
  return WEEKDAY_ORDER.filter((day) => found.includes(day));
}

function withoutPhrase(line: string, phrase: string): string {
  const rest = line
    .replace(phrase, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,\-–:]+|[\s,\-–:]+$/g, '')
    .replace(/\s+(?:on|every|each|at)$/i, '');
  return cleanLine(rest);
}

/**
 * Read how often a routine happens out of the line it was typed as. "Yoga Mon
 * Wed Fri" is yoga on those days; "Run on weekdays" is Monday to Friday; "Gym 3
 * times a week" is spread over three days; anything with no days in it is every
 * day. The cadence words come out of the text.
 *
 * A short day word standing alone ("Sit in the sun") is left as text: it only
 * counts as a day when it follows on/every/each or sits beside another day.
 */
export function parseHabit(raw: string): OnboardingRoutine {
  const line = cleanLine(raw);
  if (!line) return { text: '', days: ALL_DAYS };

  const strip = (phrase: string, days: Weekday[]): OnboardingRoutine => {
    const text = withoutPhrase(line, phrase);
    return { text: text || line, days };
  };

  const everyDay = line.match(EVERY_DAY_PHRASE);
  if (everyDay) return strip(everyDay[0], ALL_DAYS);
  // "Every morning" says when as well as how often, so the words stay.
  if (EVERY_PART_OF_DAY.test(line)) return { text: line, days: ALL_DAYS };
  const weekdays = line.match(WEEKDAYS_PHRASE);
  if (weekdays) return strip(weekdays[0], WORK_DAYS);
  const weekends = line.match(WEEKENDS_PHRASE);
  if (weekends) return strip(weekends[0], WEEKEND_DAYS);

  const times = line.match(TIMES_A_WEEK);
  if (times) {
    const days = SPREAD[timesAWeek(times[1])];
    if (days) return strip(times[0], WEEKDAY_ORDER.filter((day) => days.includes(day)));
  }
  // "Weekly review" is a name as much as a cadence, so the word stays.
  if (WEEKLY.test(line)) return { text: line, days: SPREAD[1] };

  for (const match of line.matchAll(DAY_LIST)) {
    const phrase = match[0];
    const days = daysIn(phrase);
    const led = new RegExp(`^${DAY_LEAD}`, 'i').test(phrase);
    if (days.length >= 2 || led || FULL_DAY_NAME.test(phrase)) return strip(phrase, days);
  }
  return { text: line, days: ALL_DAYS };
}

function toAction(line: string): OnboardingAction {
  return { title: cleanLine(line), today: false, due_date: null };
}

function circleFor(
  source: OnboardingCircle['source'],
  name: string,
  color: string,
  lines: readonly string[],
): OnboardingCircle | null {
  const actions = lines.map(toAction).filter((action) => action.title.length > 0);
  if (actions.length === 0) return null;
  return { source, name, color, actions, routines: [] };
}

/**
 * Turn the four lists into a plan. Which list a line was typed under says what
 * it is, so nothing is guessed: habits are routines, Work and Home are circles
 * holding their lines as actions, and anything else goes to Personal.
 */
export function buildPlan(lists: OnboardingLists): OnboardingPlan {
  const circles = [
    circleFor('work', 'Work', 'dusk', lists.work),
    circleFor('home', 'Home', 'terracotta', lists.home),
  ].filter((circle): circle is OnboardingCircle => circle !== null);
  return {
    circles,
    personal: {
      actions: lists.other.map(toAction).filter((action) => action.title.length > 0),
      routines: lists.habits.map(parseHabit).filter((routine) => routine.text.length > 0),
    },
  };
}

/**
 * Rebuild a plan from edited lists without losing what was already chosen on the
 * review screens: a routine's days, an action's place on the day, and a circle's
 * name and colour. Things are matched by their text, so a reworded line starts fresh.
 */
export function keepChoices(previous: OnboardingPlan | null, next: OnboardingPlan): OnboardingPlan {
  if (!previous) return next;
  const key = (text: string) => text.trim().toLowerCase();
  const days = new Map(
    [...previous.personal.routines, ...previous.circles.flatMap((c) => c.routines)].map((r) => [
      key(r.text),
      r.days,
    ]),
  );
  const onDay = new Set(
    [...previous.personal.actions, ...previous.circles.flatMap((c) => c.actions)]
      .filter((a) => a.today)
      .map((a) => key(a.title)),
  );
  const routines = (list: OnboardingRoutine[]) =>
    list.map((r) => ({ ...r, days: days.get(key(r.text)) ?? r.days }));
  const actions = (list: OnboardingAction[]) =>
    list.map((a) => ({ ...a, today: a.today || onDay.has(key(a.title)) }));
  return {
    circles: next.circles.map((circle) => {
      const before = previous.circles.find((c) => c.source === circle.source);
      return {
        ...circle,
        name: before?.name.trim() ? before.name : circle.name,
        color: before?.color ?? circle.color,
        actions: actions(circle.actions),
        routines: routines(circle.routines),
      };
    }),
    personal: {
      actions: actions(next.personal.actions),
      routines: routines(next.personal.routines),
    },
  };
}

/** True when a plan has nothing worth creating. */
export function isEmptyPlan(plan: OnboardingPlan): boolean {
  return (
    plan.circles.every((circle) => circle.actions.length + circle.routines.length === 0) &&
    plan.personal.actions.length === 0 &&
    plan.personal.routines.length === 0
  );
}

/** From this hour, onboarding plans tomorrow: today is nearly over. */
export const PLAN_TOMORROW_FROM_HOUR = 18;

/** The day onboarding plans: today, or tomorrow once the evening has started. */
export function onboardingPlanDay(now = new Date()): { day: string; isTomorrow: boolean } {
  const today = localToday(now);
  const isTomorrow = now.getHours() >= PLAN_TOMORROW_FROM_HOUR;
  return { day: isTomorrow ? shiftDay(today, 1) : today, isTomorrow };
}

/** Whether a routine falls on a given day (YYYY-MM-DD). */
export function routineOnDay(routine: OnboardingRoutine, day: string): boolean {
  if (routine.days.length === 0) return true;
  const index = weekdayIndex(day);
  return index !== null && routine.days.includes(WEEKDAY_ORDER[index]);
}
