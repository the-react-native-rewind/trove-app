import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionRow, RoutineRow } from '@/components/onboarding/ReviewRows';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useApplyOnboarding } from '@/data/onboarding';
import { hapticLight } from '@/lib/haptics';
import type { OnboardingPlan } from '@/lib/onboarding';
import { colors, fonts, radii, resolveAccent, spaceAccentOrder, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

const EMPTY: OnboardingPlan = { circles: [], personal: { actions: [], routines: [] } };

function nextColor(current: string): string {
  const i = spaceAccentOrder.indexOf(current as never);
  return spaceAccentOrder[(i + 1) % spaceAccentOrder.length];
}

/** Drop blank titles the person may have cleared before building. */
function tidy(plan: OnboardingPlan): OnboardingPlan {
  const actions = (list: OnboardingPlan['personal']['actions']) =>
    list.filter((a) => a.title.trim().length > 0);
  const routines = (list: OnboardingPlan['personal']['routines']) =>
    list.filter((r) => r.text.trim().length > 0);
  return {
    circles: plan.circles
      .filter((c) => c.name.trim().length > 0)
      .map((c) => ({ ...c, actions: actions(c.actions), routines: routines(c.routines) })),
    personal: { actions: actions(plan.personal.actions), routines: routines(plan.personal.routines) },
  };
}

export default function OnboardingReview() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const draft = useOnboardingDraft();
  const apply = useApplyOnboarding();
  const [plan, setPlan] = useState<OnboardingPlan>(draft.plan ?? EMPTY);
  const [busy, setBusy] = useState(false);

  function edit(mutator: (p: OnboardingPlan) => void) {
    setPlan((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as OnboardingPlan;
      mutator(next);
      return next;
    });
  }

  async function onBuild() {
    const cleaned = tidy(plan);
    setBusy(true);
    hapticLight();
    try {
      // Always runs: an empty plan creates nothing but still marks them onboarded,
      // so the gate lets them through to Today rather than looping back.
      await apply.mutateAsync(cleaned);
    } catch {
      // Even on a partial failure, send them in; whatever was created is there.
    }
    router.replace('/');
  }

  return (
    <View style={styles.fill}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: spacing.xxl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.heading}>Here’s what’s on your plate</Text>
        <Text variant="body" color={colors.inkSoft} style={styles.sub}>
          Have a quick look and tweak anything. Tap Today on the few that matter now.
          You can change all of this later.
        </Text>

        {plan.circles.map((circle, ci) => (
          <View key={ci} style={styles.card}>
            <View style={styles.cardHead}>
              <Pressable
                onPress={() => edit((p) => { p.circles[ci].color = nextColor(p.circles[ci].color) as never; })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change colour"
                style={[styles.dot, { backgroundColor: resolveAccent(circle.color) }]}
              />
              <TextInput
                value={circle.name}
                onChangeText={(name) => edit((p) => { p.circles[ci].name = name; })}
                placeholder="Circle name"
                placeholderTextColor={colors.inkFaint}
                style={styles.circleName}
              />
              <Pressable
                onPress={() => edit((p) => { p.circles.splice(ci, 1); })}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove circle"
              >
                <Ionicons name="trash-outline" size={18} color={colors.inkFaint} />
              </Pressable>
            </View>

            {circle.actions.map((action, ai) => (
              <ActionRow
                key={`a${ai}`}
                action={action}
                onChangeTitle={(title) => edit((p) => { p.circles[ci].actions[ai].title = title; })}
                onToggleToday={() =>
                  edit((p) => { p.circles[ci].actions[ai].today = !p.circles[ci].actions[ai].today; })
                }
                onRemove={() => edit((p) => { p.circles[ci].actions.splice(ai, 1); })}
              />
            ))}
            {circle.routines.map((routine, ri) => (
              <RoutineRow
                key={`r${ri}`}
                routine={routine}
                onChangeText={(text) => edit((p) => { p.circles[ci].routines[ri].text = text; })}
                onRemove={() => edit((p) => { p.circles[ci].routines.splice(ri, 1); })}
              />
            ))}

            <Pressable
              onPress={() =>
                edit((p) => { p.circles[ci].actions.push({ title: '', today: false, due_date: null }); })
              }
              style={styles.addRow}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={16} color={colors.brand} />
              <Text variant="meta" color={colors.brand}>Add an action</Text>
            </Pressable>
          </View>
        ))}

        {plan.personal.actions.length > 0 || plan.personal.routines.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <View style={[styles.dot, { backgroundColor: resolveAccent('sage') }]} />
              <Text style={styles.circleName}>Personal</Text>
            </View>
            {plan.personal.actions.map((action, ai) => (
              <ActionRow
                key={`pa${ai}`}
                action={action}
                onChangeTitle={(title) => edit((p) => { p.personal.actions[ai].title = title; })}
                onToggleToday={() =>
                  edit((p) => { p.personal.actions[ai].today = !p.personal.actions[ai].today; })
                }
                onRemove={() => edit((p) => { p.personal.actions.splice(ai, 1); })}
              />
            ))}
            {plan.personal.routines.map((routine, ri) => (
              <RoutineRow
                key={`pr${ri}`}
                routine={routine}
                onChangeText={(text) => edit((p) => { p.personal.routines[ri].text = text; })}
                onRemove={() => edit((p) => { p.personal.routines.splice(ri, 1); })}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={busy ? 'Setting things up…' : 'Looks good — build it'}
          onPress={onBuild}
          loading={busy}
          haptic="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  sub: { marginTop: -spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  circleName: {
    flex: 1,
    fontFamily: fonts.displayMedium,
    fontSize: 19,
    color: colors.ink,
    padding: 0,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.paper,
  },
});
