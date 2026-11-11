import { toDateString } from './format';
import { supabase } from './supabase';
import { spaceAccentOrder, type SpaceAccentName } from '@/theme/tokens';

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export const WEEKDAY_ORDER: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export type OnboardingAction = {
  title: string;
  today: boolean;
  due_date: string | null;
};

export type OnboardingRoutine = {
  text: string;
  days: Weekday[];
};

export type OnboardingCircle = {
  name: string;
  color: SpaceAccentName;
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
  const weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
  const weekend: Weekday[] = ['sat', 'sun'];
  if (weekdays.every((d) => set.has(d)) && set.size === 5) return 'Weekdays';
  if (weekend.every((d) => set.has(d)) && set.size === 2) return 'Weekends';
  return WEEKDAY_ORDER.filter((d) => set.has(d))
    .map((d) => DAY_LABEL[d])
    .join(', ');
}

const TIMEOUT_MS = 30000;

function cleanWeekdays(value: unknown): Weekday[] {
  if (!Array.isArray(value)) return [];
  const out: Weekday[] = [];
  for (const raw of value) {
    const day = String(raw).toLowerCase().slice(0, 3) as Weekday;
    if (WEEKDAY_ORDER.includes(day) && !out.includes(day)) out.push(day);
  }
  return out;
}

function cleanActions(value: unknown): OnboardingAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const title = String(item.title ?? '').trim().slice(0, 80);
      return {
        title,
        today: item.today === true,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(item.due_date ?? ''))
          ? String(item.due_date)
          : null,
      };
    })
    .filter((action) => action.title.length > 0);
}

function cleanRoutines(value: unknown): OnboardingRoutine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      return {
        text: String(item.text ?? '').trim().slice(0, 80),
        days: cleanWeekdays(item.days),
      };
    })
    .filter((routine) => routine.text.length > 0);
}

function cleanColor(value: unknown, index: number): SpaceAccentName {
  const name = String(value ?? '');
  if ((spaceAccentOrder as string[]).includes(name)) return name as SpaceAccentName;
  return spaceAccentOrder[index % spaceAccentOrder.length];
}

/** A circle needs at least this many items (actions + routines) to stand alone. */
const MIN_CIRCLE_ITEMS = 2;

/** Normalise and harden whatever the model returned into a usable plan. */
export function normalisePlan(raw: unknown): OnboardingPlan {
  const data = (raw ?? {}) as Record<string, unknown>;
  const rawCircles = Array.isArray(data.circles)
    ? data.circles
        .map((rawCircle, index) => {
          const circle = (rawCircle ?? {}) as Record<string, unknown>;
          return {
            name: String(circle.name ?? '').trim().slice(0, 40),
            color: cleanColor(circle.color, index),
            actions: cleanActions(circle.actions),
            routines: cleanRoutines(circle.routines),
          };
        })
        .filter((circle) => circle.name.length > 0)
    : [];
  const personal = (data.personal ?? {}) as Record<string, unknown>;
  const personalActions = cleanActions(personal.actions);
  const personalRoutines = cleanRoutines(personal.routines);

  // Deterministically enforce "a circle holds a group, not a single task":
  // any circle too small to be a real grouping has its items folded into
  // Personal. The model steers the grouping; this guarantees the threshold.
  const circles: OnboardingCircle[] = [];
  for (const circle of rawCircles) {
    if (circle.actions.length + circle.routines.length >= MIN_CIRCLE_ITEMS) {
      circles.push(circle);
    } else {
      personalActions.push(...circle.actions);
      personalRoutines.push(...circle.routines);
    }
  }

  return {
    circles,
    personal: { actions: personalActions, routines: personalRoutines },
  };
}

/** True when a plan has nothing worth creating. */
export function isEmptyPlan(plan: OnboardingPlan): boolean {
  const circleItems = plan.circles.reduce(
    (sum, c) => sum + c.actions.length + c.routines.length,
    0,
  );
  return (
    plan.circles.length === 0 &&
    circleItems === 0 &&
    plan.personal.actions.length === 0 &&
    plan.personal.routines.length === 0
  );
}

/**
 * Ask the onboarding-structure edge function to turn a spoken brain-dump into
 * circles, actions and routines. Returns null on any failure or timeout so the
 * caller can fall back to an empty, hand-editable plan.
 */
export async function structureBrainDump(input: {
  transcript: string;
}): Promise<OnboardingPlan | null> {
  try {
    const invocation = supabase.functions.invoke('onboarding-structure', {
      body: {
        transcript: input.transcript,
        today: toDateString(new Date()),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
      },
    });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
    const settled = await Promise.race([invocation, timeout]);
    if (!settled || settled.error || !settled.data) return null;
    return normalisePlan(settled.data);
  } catch {
    return null;
  }
}
