import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CollapsingScreenHeader, useCollapsingHeader } from '@/components/CollapsingHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { AccentDot } from '@/components/ui/Indicators';
import {
  useInsights,
  type CircleStat,
  type InsightsRange,
  type InsightsSummary,
  type RoutineStat,
} from '@/data/insights';
import { hapticSelection } from '@/lib/haptics';
import { colors, radii, resolveAccent, spacing, type as typeScale } from '@/theme/tokens';

const RANGES: { value: InsightsRange; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 'all', label: 'All time' },
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function heroBody(data: InsightsSummary, range: InsightsRange): string {
  const span =
    range === 'all' ? 'so far' : range === 7 ? 'in the last 7 days' : 'in the last 30 days';
  return `You ticked off ${data.doneLines} of the ${data.totalLines} lines you wrote ${span}.`;
}

function footnote(range: InsightsRange): string {
  return range === 'all' ? 'All time.' : `Over the last ${range} days.`;
}

/** A number that eases from 0 to its target whenever the target changes. */
function useCountUp(target: number, duration = 750): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      setValue(target * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** A horizontal bar whose fill grows to `fraction`, animating on mount and on change. */
function GrowBar({
  fraction,
  color = colors.brand,
  height = 8,
  delay = 0,
}: {
  fraction: number;
  color?: string;
  height?: number;
  delay?: number;
}) {
  const [width, setWidth] = useState(0);
  const grown = useSharedValue(0);
  useEffect(() => {
    grown.value = withDelay(delay, withTiming(clamp01(fraction) * width, { duration: 650 }));
  }, [fraction, width, delay, grown]);
  const fillStyle = useAnimatedStyle(() => ({ width: grown.value }));
  return (
    <View
      style={[styles.track, { height, borderRadius: height }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View style={[{ height, borderRadius: height, backgroundColor: color }, fillStyle]} />
    </View>
  );
}

function RangeToggle({
  range,
  onChange,
}: {
  range: InsightsRange;
  onChange: (next: InsightsRange) => void;
}) {
  return (
    <View style={styles.toggle}>
      {RANGES.map((option) => {
        const selected = option.value === range;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => {
              if (!selected) hapticSelection();
              onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[styles.toggleItem, selected && styles.toggleItemOn]}
          >
            <Text variant="meta" color={selected ? colors.brandDeep : colors.inkSoft}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Insights() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const collapse = useCollapsingHeader(insets.top, 52);
  const [range, setRange] = useState<InsightsRange>(30);
  const { data, isLoading, isError } = useInsights(range);

  return (
    <View style={styles.screen}>
      <CollapsingScreenHeader
        topInset={insets.top}
        onLayout={collapse.onLayout}
        animatedStyle={collapse.animatedStyle}
        pointerEvents={collapse.pointerEvents}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={28} color={colors.ink} />
          </Pressable>
          <Text variant="sectionHeading" color={colors.ink} numberOfLines={1} style={styles.title}>
            Insights
          </Text>
          <View style={styles.back} />
        </View>
      </CollapsingScreenHeader>

      <Animated.ScrollView
        onScroll={collapse.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: collapse.contentOffset + spacing.sm,
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xl,
          },
        ]}
      >
        <RangeToggle range={range} onChange={setRange} />
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : isError ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn’t load insights"
            body="Go back and try again."
          />
        ) : !data || data.totalLines === 0 ? (
          <EmptyState
            icon="stats-chart-outline"
            title="Nothing to chart yet"
            body="Tick a few lines and your patterns show up here. Try a wider range above."
          />
        ) : (
          <Summary data={data} range={range} />
        )}
      </Animated.ScrollView>
    </View>
  );
}

function Summary({ data, range }: { data: InsightsSummary; range: InsightsRange }) {
  return (
    <>
      <CompletionHero data={data} range={range} />

      {data.circles.length > 0 ? (
        <Section title="Where you finish" hint="Completed lines by circle" delay={120}>
          <View style={styles.rows}>
            {data.circles.map((circle, i) => (
              <CircleRow key={circle.name} circle={circle} delay={160 + i * 60} />
            ))}
          </View>
        </Section>
      ) : null}

      {data.routines.length > 0 ? (
        <Section title="Routines" hint="How often each routine gets done" delay={200}>
          <View style={styles.rows}>
            {data.routines.map((routine, i) => (
              <RoutineRow key={routine.key} routine={routine} delay={240 + i * 60} />
            ))}
          </View>
        </Section>
      ) : null}

      <Text variant="meta" color={colors.inkFaint} style={styles.footnote}>
        {footnote(range)}
      </Text>
    </>
  );
}

function CompletionHero({ data, range }: { data: InsightsSummary; range: InsightsRange }) {
  const animated = useCountUp(data.completionRate);
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.hero}>
      <Text variant="meta" color={colors.inkSoft} style={styles.heroKicker}>
        Completion
      </Text>
      <Text style={styles.heroNumber} color={colors.brand}>
        {Math.round(animated * 100)}%
      </Text>
      <View style={styles.heroBar}>
        <GrowBar fraction={data.completionRate} height={12} delay={120} />
      </View>
      <Text variant="body" color={colors.inkSoft} style={styles.heroBody}>
        {heroBody(data, range)}
      </Text>
    </Animated.View>
  );
}

function Section({
  title,
  hint,
  delay,
  children,
}: {
  title: string;
  hint?: string;
  delay: number;
  children: ReactNode;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(380)} style={styles.section}>
      <Text variant="sectionHeading" color={colors.ink}>
        {title}
      </Text>
      {hint ? (
        <Text variant="meta" color={colors.inkFaint} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
      <View style={styles.sectionBody}>{children}</View>
    </Animated.View>
  );
}

function CircleRow({ circle, delay }: { circle: CircleStat; delay: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <AccentDot
          color={circle.name === 'Personal' ? colors.inkFaint : resolveAccent(circle.color)}
          size={8}
        />
        <Text variant="body" color={colors.ink} numberOfLines={1} style={styles.rowName}>
          {circle.name}
        </Text>
        <Text variant="meta" color={colors.inkSoft}>
          {circle.done}/{circle.total}
        </Text>
      </View>
      <GrowBar fraction={circle.total ? circle.done / circle.total : 0} height={6} delay={delay} />
    </View>
  );
}

function RoutineRow({ routine, delay }: { routine: RoutineStat; delay: number }) {
  const rate = routine.total ? routine.done / routine.total : 0;
  // Green when kept, warm amber when it is slipping.
  const color = rate >= 0.5 ? colors.brand : colors.honey;
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text variant="body" color={colors.ink} numberOfLines={1} style={styles.rowName}>
          {routine.label}
        </Text>
        <Text variant="meta" color={colors.inkSoft}>
          {routine.done}/{routine.total} · {Math.round(rate * 100)}%
        </Text>
      </View>
      <GrowBar fraction={rate} color={color} height={6} delay={delay} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  back: { width: 40, alignItems: 'flex-start', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  toggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    padding: 3,
  },
  toggleItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  toggleItemOn: { backgroundColor: colors.brandSoft },
  hero: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroKicker: { textTransform: 'uppercase', letterSpacing: 1 },
  heroNumber: {
    fontFamily: typeScale.screenTitle.fontFamily,
    fontSize: 72,
    lineHeight: 80,
  },
  heroBar: { alignSelf: 'stretch', marginTop: spacing.sm, marginBottom: spacing.sm },
  heroBody: { textAlign: 'center' },
  section: { gap: spacing.xs },
  hint: { marginBottom: spacing.xs },
  sectionBody: { marginTop: spacing.sm },
  rows: { gap: spacing.md },
  row: { gap: spacing.xs },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowName: { flex: 1 },
  track: { backgroundColor: colors.hairline, overflow: 'hidden', alignSelf: 'stretch' },
  footnote: { textAlign: 'center', marginTop: spacing.sm },
});
