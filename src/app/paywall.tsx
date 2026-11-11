import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { PRO_PLANS, PRO_TRIAL_DAYS, useStartTrial } from '@/data/pro';
import { hapticMedium } from '@/lib/haptics';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Plan = 'annual' | 'monthly';

const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'infinite',
    title: 'Every circle you need',
    body: 'A circle for each project, business and part of your life — no limit.',
  },
  {
    icon: 'stats-chart',
    title: 'See what you finish',
    body: 'Insights on what’s getting done, and where it quietly slips.',
  },
  {
    icon: 'mic',
    title: 'Say it out loud, always',
    body: 'Keep turning what’s in your head into a list, long after day one.',
  },
  {
    icon: 'sparkles',
    title: 'Agents where they earn a place',
    body: 'Hand a line to Claude, ChatGPT or Cursor — after your people.',
  },
];

export default function Paywall() {
  const router = useRouter();
  const startTrial = useStartTrial();
  const [plan, setPlan] = useState<Plan>('annual');
  const [busy, setBusy] = useState(false);

  async function subscribe() {
    setBusy(true);
    hapticMedium();
    try {
      await startTrial.mutateAsync(plan);
      if (router.canGoBack()) router.back();
    } catch {
      setBusy(false);
    }
  }

  const chosen = PRO_PLANS[plan];

  return (
    <ModalScaffold
      title="Trove Pro"
      footer={
        <View style={styles.footer}>
          <Button
            label={`Start my ${PRO_TRIAL_DAYS} days free`}
            onPress={subscribe}
            loading={busy}
            haptic="none"
          />
          <Text variant="meta" color={colors.inkFaint} center style={styles.fine}>
            {PRO_TRIAL_DAYS} days free, then {chosen.price} / {chosen.per}. Cancel anytime.
          </Text>
          <View style={styles.legalRow}>
            <Text variant="meta" color={colors.inkFaint}>Restore</Text>
            <Text variant="meta" color={colors.inkFaint}>·</Text>
            <Text variant="meta" color={colors.inkFaint}>Terms</Text>
            <Text variant="meta" color={colors.inkFaint}>·</Text>
            <Text variant="meta" color={colors.inkFaint}>Privacy</Text>
          </View>
        </View>
      }
    >
      <Text style={styles.heading}>Run your whole life,{'\n'}not a corner of it.</Text>

      <View style={styles.reassure}>
        <Ionicons name="people-outline" size={18} color={colors.brandDeep} />
        <Text variant="bodyMedium" color={colors.brandDeep} style={styles.reassureText}>
          Only you pay. Invite anyone into a circle — they never do.
        </Text>
      </View>

      <View style={styles.benefits}>
        {BENEFITS.map((b) => (
          <View key={b.title} style={styles.benefit}>
            <View style={styles.benefitIcon}>
              <Ionicons name={b.icon} size={19} color={colors.brand} />
            </View>
            <View style={styles.benefitText}>
              <Text variant="cardTitle" color={colors.ink}>{b.title}</Text>
              <Text variant="meta" color={colors.inkSoft}>{b.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.plans}>
        <PlanCard
          selected={plan === 'annual'}
          onPress={() => setPlan('annual')}
          label="Yearly"
          price={PRO_PLANS.annual.price}
          per="year"
          note={PRO_PLANS.annual.note}
        />
        <PlanCard
          selected={plan === 'monthly'}
          onPress={() => setPlan('monthly')}
          label="Monthly"
          price={PRO_PLANS.monthly.price}
          per="month"
        />
      </View>
    </ModalScaffold>
  );
}

function PlanCard({
  selected,
  onPress,
  label,
  price,
  per,
  note,
}: {
  selected: boolean;
  onPress: () => void;
  label: string;
  price: string;
  per: string;
  note?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.plan, selected && styles.planOn]}
    >
      <View style={styles.planTop}>
        <Text variant="cardTitle" color={selected ? colors.brandDeep : colors.ink}>
          {label}
        </Text>
        <View style={[styles.radio, selected && styles.radioOn]}>
          {selected ? <Ionicons name="checkmark" size={13} color={colors.onBrand} /> : null}
        </View>
      </View>
      <Text style={styles.planPrice} color={colors.ink}>{price}</Text>
      <Text variant="meta" color={colors.inkFaint}>per {per}</Text>
      {note ? (
        <View style={styles.planNote}>
          <Text variant="meta" color={colors.brandDeep}>{note}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 28,
    lineHeight: 34,
    color: colors.ink,
  },
  reassure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.card,
    padding: spacing.md,
  },
  reassureText: { flex: 1 },
  benefits: { gap: spacing.lg },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: { flex: 1, gap: 2 },
  plans: { flexDirection: 'row', gap: spacing.md },
  plan: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: 2,
  },
  planOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planPrice: { fontFamily: fonts.displaySemiBold, fontSize: 24, marginTop: spacing.sm },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  planNote: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  footer: { gap: spacing.sm },
  fine: {},
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
