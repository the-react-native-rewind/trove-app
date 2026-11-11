import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import {
  billingAvailable,
  FREE_CIRCLES,
  FREE_TODAY_ITEMS,
  PRO_PLANS,
  PRO_TRIAL_DAYS,
  usePlanPrices,
  usePro,
  usePurchasePro,
  useRestorePro,
} from '@/data/pro';
import { alertDialog } from '@/lib/dialog';
import { hapticMedium } from '@/lib/haptics';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Plan = 'annual' | 'monthly';

export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://troving.app/privacy';
const APP_STORE_URL = 'https://apps.apple.com/app/id6818141231';

// Only what Pro actually unlocks (see the gates in space-new, Insights,
// circle analytics, connect and TodayView).
const BENEFITS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'infinite',
    title: 'Every circle you need',
    body: `A circle for each project, business and part of your life. Free covers ${FREE_CIRCLES} plus Personal.`,
  },
  {
    icon: 'stats-chart',
    title: 'See where the week went',
    body: 'Insights on what’s getting done in each circle, and where it quietly slips.',
  },
  {
    icon: 'sunny-outline',
    title: 'A full Today',
    body: `As many things on a day as you need. Free holds ${FREE_TODAY_ITEMS}.`,
  },
  {
    icon: 'sparkles',
    title: 'Agents where they earn a place',
    body: 'Hand a line to Claude, ChatGPT or Cursor — after your people.',
  },
];

export default function Paywall() {
  const router = useRouter();
  const { isPro } = usePro();
  const prices = usePlanPrices();
  const purchase = usePurchasePro();
  const restore = useRestorePro();
  const [plan, setPlan] = useState<Plan>('annual');

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }

  async function subscribe() {
    if (!billingAvailable) {
      Linking.openURL(APP_STORE_URL);
      return;
    }
    hapticMedium();
    try {
      const outcome = await purchase.mutateAsync(plan);
      if (outcome.status === 'purchased') {
        Toast.show({ type: 'success', text1: 'Welcome to Trove Pro' });
        close();
      } else if (outcome.status === 'pending') {
        alertDialog('Almost there', 'The App Store is still confirming your purchase. Pro switches on as soon as it does.');
      }
    } catch (e) {
      alertDialog('That didn’t go through', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function onRestore() {
    if (!billingAvailable) {
      alertDialog('Restore on iPhone', 'Open Trove on your iPhone and tap Restore there. Pro then works on every device you sign in to.');
      return;
    }
    try {
      const active = await restore.mutateAsync();
      if (active) {
        Toast.show({ type: 'success', text1: 'Trove Pro restored' });
        close();
      } else {
        alertDialog('Nothing to restore', 'We couldn’t find a Trove Pro subscription on this Apple ID.');
      }
    } catch (e) {
      alertDialog('Restore didn’t work', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  const price = prices[plan];
  const per = PRO_PLANS[plan].per;

  if (isPro) {
    return (
      <ModalScaffold title="Trove Pro" footer={<Button label="Done" onPress={close} />}>
        <Text style={styles.heading}>You’re on Trove Pro.</Text>
        <Text variant="body" color={colors.inkSoft}>
          Every circle, Insights and a full Today are yours. The people you invite never pay.
        </Text>
      </ModalScaffold>
    );
  }

  return (
    <ModalScaffold
      title="Trove Pro"
      footer={
        <View style={styles.footer}>
          <Button
            label={billingAvailable ? `Start my ${PRO_TRIAL_DAYS} days free` : 'Get Trove Pro on iPhone'}
            onPress={subscribe}
            loading={purchase.isPending}
            haptic="none"
          />
          <Text variant="meta" color={colors.inkFaint} center style={styles.fine}>
            {billingAvailable
              ? `${PRO_TRIAL_DAYS} days free, then ${price} / ${per}. Renews automatically until you cancel, at least 24 hours before the period ends, in your Apple ID settings.`
              : 'Trove Pro is bought in the Trove iPhone app, and unlocks here on the same account.'}
          </Text>
          <View style={styles.legalRow}>
            <Pressable onPress={onRestore} hitSlop={8} accessibilityRole="button" disabled={restore.isPending}>
              <Text variant="meta" color={colors.inkSoft}>
                {restore.isPending ? 'Restoring…' : 'Restore'}
              </Text>
            </Pressable>
            <Text variant="meta" color={colors.inkFaint}>·</Text>
            <Pressable onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8} accessibilityRole="link">
              <Text variant="meta" color={colors.inkSoft}>Terms</Text>
            </Pressable>
            <Text variant="meta" color={colors.inkFaint}>·</Text>
            <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8} accessibilityRole="link">
              <Text variant="meta" color={colors.inkSoft}>Privacy</Text>
            </Pressable>
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
          price={prices.annual}
          per="year"
          note={PRO_PLANS.annual.note}
        />
        <PlanCard
          selected={plan === 'monthly'}
          onPress={() => setPlan('monthly')}
          label="Monthly"
          price={prices.monthly}
          per="month"
        />
      </View>
      <View style={styles.bottomClear} />
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
  bottomClear: { height: spacing.xl },
  fine: {},
  legalRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
});
