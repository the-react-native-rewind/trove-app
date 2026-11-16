import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { ActionRow, RoutineRow } from '@/components/onboarding/ReviewRows';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useApplyOnboarding } from '@/data/onboarding';
import { formatDayLabel } from '@/lib/format';
import { hapticLight } from '@/lib/haptics';
import {
  onboardingPlanDay,
  routineOnDay,
  type OnboardingAction,
  type OnboardingPlan,
} from '@/lib/onboarding';
import { colors, fonts, radii, resolveAccent, spaceAccentOrder, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

const EMPTY: OnboardingPlan = { circles: [], personal: { actions: [], routines: [] } };

/** The ending is three short looks: when the routines fall, the circles, the day. */
type Stage = 'routines' | 'circles' | 'day';

// The lists are steps 2 to 5; these follow them.
const STAGE_STEP: Record<Stage, number> = { routines: 6, circles: 7, day: 8 };

/**
 * A circle's name. The whole title row starts editing, not just the letters,
 * so tapping the space beside a short name opens the keyboard too.
 */
function CircleName({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (name: string) => void;
}) {
  const input = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessibilityRole="button"
      accessibilityLabel={`Rename ${value || 'this circle'}`}
      style={styles.nameField}
    >
      <TextInput
        ref={input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Circle name"
        placeholderTextColor={colors.inkFaint}
        returnKeyType="done"
        style={styles.circleName}
      />
    </Pressable>
  );
}

const PERSONAL_COLOR = 'sage';

function nextColor(current: string): string {
  const i = spaceAccentOrder.indexOf(current as never);
  return spaceAccentOrder[(i + 1) % spaceAccentOrder.length];
}

/** A short "2 actions" summary of what a circle holds. */
function actionSummary(actions: number): string {
  if (actions === 0) return 'Nothing yet';
  return `${actions} action${actions > 1 ? 's' : ''}`;
}

/** Drop blank titles the person may have cleared before building. */
function tidy(plan: OnboardingPlan): OnboardingPlan {
  const actions = (list: OnboardingAction[]) => list.filter((a) => a.title.trim().length > 0);
  const routines = (list: OnboardingPlan['personal']['routines']) =>
    list.filter((r) => r.text.trim().length > 0);
  return {
    circles: plan.circles
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ ...c, actions: actions(c.actions), routines: routines(c.routines) })),
    personal: { actions: actions(plan.personal.actions), routines: routines(plan.personal.routines) },
  };
}

/** Which stages there is anything to show on. The day always closes. */
function stagesFor(plan: OnboardingPlan): Stage[] {
  const hasRoutines = plan.personal.routines.length > 0;
  const hasActions =
    plan.personal.actions.length > 0 || plan.circles.some((circle) => circle.actions.length > 0);
  const stages: Stage[] = [];
  if (hasRoutines) stages.push('routines');
  if (hasActions) stages.push('circles');
  stages.push('day');
  return stages;
}

/** One action, wherever it lives. `circle` is null for the Personal circle. */
type ActionRef = {
  circle: number | null;
  index: number;
  title: string;
  today: boolean;
  circleName: string;
  color: string;
};

function allActions(plan: OnboardingPlan): ActionRef[] {
  const out: ActionRef[] = [];
  plan.circles.forEach((circle, ci) => {
    circle.actions.forEach((action, ai) => {
      out.push({
        circle: ci,
        index: ai,
        title: action.title,
        today: action.today,
        circleName: circle.name,
        color: circle.color,
      });
    });
  });
  plan.personal.actions.forEach((action, ai) => {
    out.push({
      circle: null,
      index: ai,
      title: action.title,
      today: action.today,
      circleName: 'Personal',
      color: PERSONAL_COLOR,
    });
  });
  return out.filter((action) => action.title.trim().length > 0);
}

export default function OnboardingReview() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const apply = useApplyOnboarding();
  const plan = draft.plan ?? EMPTY;
  const [busy, setBusy] = useState(false);
  // Both fixed for the visit: the stages do not reshuffle as things are removed,
  // and the day does not flip under the person at 6pm.
  const [stages] = useState(() => stagesFor(plan));
  const [planned] = useState(() => onboardingPlanDay());
  const [stage, setStage] = useState<Stage>(stages[0]);

  const position = stages.indexOf(stage);
  const isLast = position === stages.length - 1;
  const dayLabel = planned.isTomorrow ? 'Tomorrow' : 'Today';
  const dayWord = dayLabel.toLowerCase();

  function edit(mutator: (p: OnboardingPlan) => void) {
    // Build on the plan as it is now: two quick edits in a row (typing a name,
    // say) must not each start from the copy this render closed over.
    draft.setPlan((current) => {
      const next = JSON.parse(JSON.stringify(current ?? plan)) as OnboardingPlan;
      mutator(next);
      return next;
    });
  }

  function setOnDay(action: ActionRef, on: boolean) {
    hapticLight();
    edit((p) => {
      const list = action.circle === null ? p.personal.actions : p.circles[action.circle].actions;
      list[action.index].today = on;
    });
  }

  function onBack() {
    if (position > 0) setStage(stages[position - 1]);
    else router.back();
  }

  async function onContinue() {
    if (!isLast) {
      setStage(stages[position + 1]);
      return;
    }
    setBusy(true);
    hapticLight();
    try {
      // Always runs: an empty plan creates nothing but still marks them onboarded,
      // so the gate lets them through to Today rather than looping back.
      await apply.mutateAsync(tidy(plan));
    } catch {
      // Even on a partial failure, send them in; whatever was created is there.
    }
    router.replace('/');
  }

  const actions = allActions(plan);
  const onDay = actions.filter((action) => action.today);
  const offDay = actions.filter((action) => !action.today);
  const routinesOnDay = plan.personal.routines.filter(
    (routine) => routine.text.trim() && routineOnDay(routine, planned.day),
  );

  return (
    <OnboardingScaffold
      step={STAGE_STEP[stage]}
      align="top"
      onBack={busy ? undefined : onBack}
      footer={
        <Button
          label={isLast ? 'Looks good' : 'Continue'}
          onPress={onContinue}
          loading={busy}
          haptic="none"
        />
      }
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Animated.View key={stage} entering={FadeIn.duration(220)} style={styles.stage}>
          {stage === 'routines' ? (
            <>
              <View>
                <Text style={styles.heading}>When do you do these?</Text>
                <Text style={styles.sub}>Tap the days for each routine.</Text>
              </View>
              <View>
                {plan.personal.routines.map((routine, ri) => (
                  <View key={ri} style={styles.routine}>
                    <RoutineRow
                      routine={routine}
                      onChangeText={(text) => edit((p) => { p.personal.routines[ri].text = text; })}
                      onChangeDays={(days) => edit((p) => { p.personal.routines[ri].days = days; })}
                      onRemove={() => edit((p) => { p.personal.routines.splice(ri, 1); })}
                    />
                  </View>
                ))}
                {plan.personal.routines.length === 0 ? (
                  <Text variant="body" color={colors.inkSoft}>
                    No routines left. You can add some later.
                  </Text>
                ) : null}
              </View>
            </>
          ) : null}

          {stage === 'circles' ? (
            <>
              <View>
                <Text style={styles.heading}>Your circles</Text>
                <Text style={styles.sub}>
                  Everything you listed, in the circle it belongs to. Rename a circle, or take out
                  anything that shouldn’t be there.
                </Text>
              </View>

              {plan.circles.map((circle, ci) => (
                <View key={circle.source} style={styles.card}>
                  <View style={styles.cardHead}>
                    <Pressable
                      onPress={() => edit((p) => { p.circles[ci].color = nextColor(p.circles[ci].color); })}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Change colour"
                      style={[styles.dot, { backgroundColor: resolveAccent(circle.color) }]}
                    />
                    <View style={styles.headText}>
                      <CircleName
                        value={circle.name}
                        onChangeText={(name) => edit((p) => { p.circles[ci].name = name; })}
                      />
                      <Text variant="meta" color={colors.inkFaint}>
                        {actionSummary(circle.actions.length)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {circle.actions.map((action, ai) => (
                    <ActionRow
                      key={`a${ai}`}
                      action={action}
                      onChangeTitle={(title) => edit((p) => { p.circles[ci].actions[ai].title = title; })}
                      onRemove={() => edit((p) => { p.circles[ci].actions.splice(ai, 1); })}
                    />
                  ))}
                </View>
              ))}

              {plan.personal.actions.length > 0 ? (
                <View style={styles.card}>
                  <View style={styles.cardHead}>
                    <View style={[styles.dot, { backgroundColor: resolveAccent(PERSONAL_COLOR) }]} />
                    <View style={styles.headText}>
                      <View style={styles.nameField}>
                        <Text style={styles.circleName}>Personal</Text>
                      </View>
                      <Text variant="meta" color={colors.inkFaint}>
                        {actionSummary(plan.personal.actions.length)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  {plan.personal.actions.map((action, ai) => (
                    <ActionRow
                      key={`pa${ai}`}
                      action={action}
                      onChangeTitle={(title) => edit((p) => { p.personal.actions[ai].title = title; })}
                      onRemove={() => edit((p) => { p.personal.actions.splice(ai, 1); })}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          {stage === 'day' ? (
            <>
              <View>
                <Text style={styles.heading}>Here’s your {dayWord}</Text>
                <Text style={styles.sub}>
                  {offDay.length > 0 || onDay.length > 0
                    ? `Your routines are on it. Add anything else you want to do ${dayWord}.`
                    : `Your routines for ${dayWord} are on it.`}
                </Text>
              </View>

              <View>
                <Text variant="label" color={colors.inkFaint} style={styles.sectionLabel}>
                  {dayLabel} · {formatDayLabel(planned.day)}
                </Text>
                {routinesOnDay.map((routine, i) => (
                  <View key={`r${i}`} style={styles.dayRow}>
                    <View style={styles.dayIcon}>
                      <Ionicons name="repeat" size={16} color={colors.inkFaint} />
                    </View>
                    <Text variant="body" color={colors.ink} style={styles.dayText}>
                      {routine.text.trim()}
                    </Text>
                  </View>
                ))}
                {onDay.map((action) => (
                  <Animated.View
                    key={`${action.circle}-${action.index}`}
                    entering={FadeIn.duration(160)}
                    style={styles.dayRow}
                  >
                    <View style={styles.dayIcon}>
                      <View style={[styles.swatch, { backgroundColor: resolveAccent(action.color) }]} />
                    </View>
                    <Text variant="body" color={colors.ink} style={styles.dayText}>
                      {action.title.trim()}
                    </Text>
                    <Pressable
                      onPress={() => setOnDay(action, false)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Take ${action.title} off ${dayWord}`}
                      style={styles.dayButton}
                    >
                      <Ionicons name="close" size={18} color={colors.inkFaint} />
                    </Pressable>
                  </Animated.View>
                ))}
                {routinesOnDay.length === 0 && onDay.length === 0 ? (
                  <Text variant="body" color={colors.inkSoft} style={styles.emptyDay}>
                    Nothing on it yet.
                  </Text>
                ) : null}
              </View>

              {offDay.length > 0 ? (
                <View>
                  <Text variant="label" color={colors.inkFaint} style={styles.sectionLabel}>
                    Add from your circles
                  </Text>
                  {offDay.map((action) => (
                    <Pressable
                      key={`${action.circle}-${action.index}`}
                      onPress={() => setOnDay(action, true)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${action.title} to ${dayWord}`}
                      style={styles.dayRow}
                    >
                      <View style={styles.dayIcon}>
                        <Ionicons name="add" size={20} color={colors.brand} />
                      </View>
                      <Text variant="body" color={colors.inkSoft} style={styles.dayText}>
                        {action.title.trim()}
                      </Text>
                      <Text variant="meta" color={colors.inkFaint} numberOfLines={1} style={styles.circleTag}>
                        {action.circleName}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </Animated.View>
      </ScrollView>
    </OnboardingScaffold>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.xl },
  stage: { gap: spacing.xl },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 32,
    lineHeight: 39,
    color: colors.ink,
  },
  sub: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyRegular,
    fontSize: 17,
    lineHeight: 24,
    color: colors.inkSoft,
  },
  routine: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, gap: 2 },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 10 },
  // Generous enough to hit without aiming at the letters.
  nameField: { minHeight: 34, justifyContent: 'center' },
  circleName: {
    fontFamily: fonts.displayMedium,
    fontSize: 20,
    color: colors.ink,
    padding: 0,
  },
  divider: { height: 1, backgroundColor: colors.hairline, marginVertical: spacing.sm },
  sectionLabel: { marginBottom: spacing.xs },
  // Flat rows with a hairline, the way the planner draws a day.
  dayRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  dayIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  dayText: { flex: 1, paddingVertical: spacing.sm },
  dayButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 9, height: 9, borderRadius: 5 },
  circleTag: { maxWidth: 110 },
  emptyDay: { paddingVertical: spacing.sm },
});
