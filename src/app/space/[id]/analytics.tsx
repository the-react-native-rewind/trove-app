import { useLocalSearchParams } from 'expo-router';
import { type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProLock } from '@/components/ProLock';
import { EmptyState } from '@/components/ui/EmptyState';
import { StackScreen } from '@/components/ui/StackScreen';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { useRoster } from '@/data/members';
import { usePro } from '@/data/pro';
import { useSpaces } from '@/data/spaces';
import { useTasks } from '@/data/tasks';
import { colors, radii, spacing, type as typeScale } from '@/theme/tokens';

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function CircleAnalytics() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const { data: spaces = [] } = useSpaces();
  const { data: tasks = [], isLoading, isError } = useTasks(spaceId ?? '');
  const { data: roster = [] } = useRoster(spaceId ?? '');
  // Gates on the viewer for now. Owner-based (the circle's owner being Pro
  // unlocks it for every member) is the intended model — a follow-up.
  const { isPro, isLoading: proLoading } = usePro();
  const space = spaces.find((s) => s.id === spaceId);

  const total = tasks.length;
  const done = tasks.filter((task) => task.status === 'done').length;
  const open = total - done;
  const rate = total > 0 ? done / total : 0;

  const byMember = roster
    .map((member) => {
      const assigned = tasks.filter((task) =>
        task.assignees.some((person) => person.id === member.user_id),
      );
      return {
        key: member.user_id,
        name: member.profile?.display_name ?? 'Member',
        avatar: member.profile?.avatar_url ?? null,
        isAgent: member.is_agent,
        done: assigned.filter((task) => task.status === 'done').length,
        total: assigned.length,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.done - a.done || b.total - a.total);

  if (!proLoading && !isPro) {
    return (
      <ProLock
        title="See how your circle’s doing"
        body="Who’s finished what, how much is open, and how the circle’s moving. It’s part of Trove Pro."
      />
    );
  }

  return (
    <StackScreen title={space ? `${space.name} analytics` : 'Analytics'}>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : isError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn’t load analytics"
          body="Go back and try again."
        />
      ) : total === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="Nothing to chart yet"
          body="Add a few actions to this circle and its breakdown shows up here."
        />
      ) : (
        <>
          <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
            <Text variant="meta" color={colors.inkSoft} style={styles.heroKicker}>
              Completed
            </Text>
            <Text style={styles.heroNumber} color={colors.brand}>
              {pct(rate)}
            </Text>
            <View style={styles.heroBar}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.round(rate * 100)}%` }]} />
              </View>
            </View>
            <Text variant="body" color={colors.inkSoft} style={styles.heroBody}>
              {done} of {total} actions in this circle are done.
            </Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(100).duration(360)} style={styles.tiles}>
            <Tile value={`${open}`} label="open" />
            <Tile value={`${done}`} label="done" />
            <Tile value={`${roster.length}`} label={roster.length === 1 ? 'member' : 'members'} />
          </Animated.View>

          {byMember.length > 0 ? (
            <Section title="By member" hint="Actions done, out of what they’re assigned" delay={180}>
              {byMember.map((row, i) => (
                <Animated.View
                  key={row.key}
                  entering={FadeInDown.delay(220 + i * 60).duration(340)}
                  style={styles.memberRow}
                >
                  <View style={styles.memberHead}>
                    <Avatar name={row.name} uri={row.avatar} size={24} />
                    <Text variant="body" color={colors.ink} numberOfLines={1} style={styles.memberName}>
                      {row.name}
                      {row.isAgent ? ' · Agent' : ''}
                    </Text>
                    <Text variant="meta" color={colors.inkSoft}>
                      {row.done}/{row.total}
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${row.total ? Math.round((row.done / row.total) * 100) : 0}%` },
                      ]}
                    />
                  </View>
                </Animated.View>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </StackScreen>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text variant="sectionHeading" color={colors.ink}>
        {value}
      </Text>
      <Text variant="meta" color={colors.inkSoft}>
        {label}
      </Text>
    </View>
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
    <Animated.View entering={FadeInDown.delay(delay).duration(360)} style={styles.section}>
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

const styles = StyleSheet.create({
  center: { paddingVertical: spacing.xxl, alignItems: 'center' },
  hero: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  heroKicker: { textTransform: 'uppercase', letterSpacing: 1 },
  heroNumber: { fontFamily: typeScale.screenTitle.fontFamily, fontSize: 64, lineHeight: 72 },
  heroBar: { alignSelf: 'stretch', marginTop: spacing.sm, marginBottom: spacing.sm },
  heroBody: { textAlign: 'center' },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  section: { gap: spacing.xs },
  hint: { marginBottom: spacing.xs },
  sectionBody: { marginTop: spacing.sm, gap: spacing.md },
  memberRow: { gap: spacing.xs },
  memberHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  memberName: { flex: 1 },
  track: {
    height: 8,
    borderRadius: 8,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
  fill: { height: 8, borderRadius: 8, backgroundColor: colors.brand },
});
