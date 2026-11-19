/**
 * Goals: the few results a person is working towards, kept away from the
 * day-to-day of circles and actions.
 *
 * Every goal names one result, and the shape of that result is the point of
 * the feature. A goal you cannot check is a wish, so Trove only accepts two
 * kinds: a written outcome that is either true or it is not, or a number to
 * reach. There is no due date — a date turns a direction into a task.
 */

/** Which shape a goal's result takes. */
export type GoalResultKind = 'outcome' | 'number';

/**
 * How a counted goal's figures are written out. The number on its own is
 * rarely the whole story — 4000 could be pounds, kilos or sign-ups.
 *
 *   'plain'    the unit trails the pair:  "40 of 100 paying users"
 *   'currency' the unit leads each one:   "£40 of £100"
 *   'percent'  no unit:                   "40% of 100%"
 *
 * Weight, distance and the rest are 'plain' with the unit named, so this stays
 * a choice about formatting rather than a list of every measure going.
 */
export type GoalNumberFormat = 'plain' | 'currency' | 'percent';

export const GOAL_NUMBER_FORMATS: readonly GoalNumberFormat[] = ['plain', 'currency', 'percent'];

/** What the unit field is asking for, which changes with the format. */
export const GOAL_UNIT_LABEL: Record<GoalNumberFormat, string> = {
  plain: 'Counting what',
  currency: 'Symbol',
  percent: '',
};

export const GOAL_UNIT_PLACEHOLDER: Record<GoalNumberFormat, string> = {
  plain: 'paying users',
  currency: '£',
  percent: '',
};

export type GoalProject = {
  id: string;
  name: string;
  color: string;
  spaceId: string;
};

export type Goal = {
  id: string;
  title: string;
  description: string | null;
  resultKind: GoalResultKind;
  /** The written result, when resultKind is 'outcome'. */
  outcome: string | null;
  /** The figure to reach, when resultKind is 'number'. */
  targetValue: number | null;
  /** Where a counted goal stands now. Meaningless for a written one. */
  currentValue: number;
  /** What is being counted, for display: 'paying users', 'kg', or a symbol. */
  unit: string | null;
  /** How the figures read. Only meaningful when resultKind is 'number'. */
  numberFormat: GoalNumberFormat;
  achievedAt: string | null;
  createdAt: string;
  /** Projects tied to this goal. Empty until something is linked. */
  projects: GoalProject[];
};

/** The sidebar entry, alongside TODAY_VIEW_ID and the circles. */
export const GOALS_VIEW_ID = 'goals';

export const GOAL_TITLE_MAX = 200;
export const GOAL_OUTCOME_MAX = 500;
export const GOAL_DESCRIPTION_MAX = 4000;
export const GOAL_UNIT_MAX = 40;

/** Collapse whitespace and trim, the way every other text field here does. */
export function normalizeGoalText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function isGoalAchieved(goal: Pick<Goal, 'achievedAt'>): boolean {
  return goal.achievedAt !== null;
}

/**
 * A number the goal can actually be saved with: finite, not negative, and not
 * absurdly precise. Anything unusable reads as 0.
 */
export function cleanGoalValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  return Math.round(value * 100) / 100;
}

/** Parse what someone typed into a value field. Null when it is not a number. */
export function parseGoalValue(input: string): number | null {
  const text = input.trim().replace(/,/g, '');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return null;
  return cleanGoalValue(value);
}

/**
 * How far along a goal is, 0 to 1.
 *
 * A written goal has no middle: it is 0 until it is marked reached. A counted
 * one is current over target, clamped, so going past the target still reads as
 * done rather than overflowing the bar.
 */
export function goalProgress(goal: Goal): number {
  if (isGoalAchieved(goal)) return 1;
  if (goal.resultKind !== 'number') return 0;
  const target = goal.targetValue;
  if (target === null || target <= 0) return 0;
  return Math.min(1, Math.max(0, goal.currentValue / target));
}

/**
 * A number with thousands separators, and no trailing zeros: 12 reads as "12",
 * 12.5 as "12.5", 10000 as "10,000". Hand-rolled rather than toLocaleString,
 * which cannot be relied on to group digits on Hermes.
 */
function formatValue(value: number): string {
  const fixed = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  const [whole, fraction] = fixed.split('.');
  const grouped = (whole ?? '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** One figure, written the way the goal's format asks for. */
export function formatGoalAmount(
  value: number,
  format: GoalNumberFormat,
  unit: string | null,
): string {
  const number = formatValue(value);
  if (format === 'percent') return `${number}%`;
  if (format === 'currency') return `${(unit ?? '').trim()}${number}`;
  return number;
}

/**
 * The one line under the title that says where the goal stands:
 * "12 of 100 paying users", or the written outcome itself.
 */
export function goalResultLabel(goal: Goal): string {
  if (goal.resultKind === 'number') {
    const target = goal.targetValue;
    if (target === null) return '';
    const format = goal.numberFormat;
    const current = formatGoalAmount(goal.currentValue, format, goal.unit);
    const reached = formatGoalAmount(target, format, goal.unit);
    // A plain unit trails the pair; a symbol or % already rides on each figure.
    const trailing = format === 'plain' && goal.unit ? ` ${goal.unit}` : '';
    return `${current} of ${reached}${trailing}`;
  }
  return goal.outcome ?? '';
}

/**
 * What is missing before this goal can be saved, or null when it is ready.
 * The message is the one shown to the person, so it is written as advice.
 */
export function goalDraftProblem(draft: {
  title: string;
  resultKind: GoalResultKind;
  outcome: string;
  targetValue: string;
}): string | null {
  const title = normalizeGoalText(draft.title);
  if (!title) return 'Give the goal a name.';
  if (title.length > GOAL_TITLE_MAX) return `A name can be ${GOAL_TITLE_MAX} characters or fewer.`;
  if (draft.resultKind === 'outcome') {
    const outcome = normalizeGoalText(draft.outcome);
    if (!outcome) return 'Write what will be true when you have got there.';
    if (outcome.length > GOAL_OUTCOME_MAX) {
      return `A result can be ${GOAL_OUTCOME_MAX} characters or fewer.`;
    }
    return null;
  }
  const target = parseGoalValue(draft.targetValue);
  if (target === null) return 'Set the number you are aiming for.';
  if (target <= 0) return 'Aim for something above zero.';
  return null;
}

/**
 * List order: goals still open first, newest first within each group, and the
 * ones already reached gathered underneath. Reaching a goal moves it down,
 * the same way ticking a line moves it on the day.
 */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const reached = Number(isGoalAchieved(a)) - Number(isGoalAchieved(b));
    if (reached !== 0) return reached;
    return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
  });
}

export function withoutGoal(goals: readonly Goal[], id: string): Goal[] {
  if (!goals.some((goal) => goal.id === id)) return goals as Goal[];
  return goals.filter((goal) => goal.id !== id);
}

export function patchGoal(goals: readonly Goal[], id: string, patch: Partial<Goal>): Goal[] {
  let changed = false;
  const next = goals.map((goal) => {
    if (goal.id !== id) return goal;
    changed = true;
    return { ...goal, ...patch };
  });
  return changed ? next : (goals as Goal[]);
}
