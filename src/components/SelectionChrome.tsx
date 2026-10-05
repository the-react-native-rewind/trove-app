import { Ionicons } from '@expo/vector-icons';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { fetchRoster } from '@/data/members';
import { useBulkUpdateTasks } from '@/data/tasks';
import { peopleInEveryCircle, sharedAssigneeIds, uniqueSpaceIds, type AssignablePerson } from '@/lib/assign';
import { qk } from '@/lib/queryClient';
import type { RosterMember, TaskWithRefs } from '@/lib/types';
import { useSelection } from '@/providers/SelectionProvider';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Avatar } from './ui/Avatar';
import { Text } from './ui/Text';

export function SelectionHeader({
  listIds,
  wide,
}: {
  listIds: readonly string[];
  wide?: boolean;
}) {
  const { count, exit, selectAll, isSelected } = useSelection();
  const allSelected = listIds.length > 0 && listIds.every((id) => isSelected(id));
  const label = count === 1 ? '1 selected' : `${count} selected`;

  return (
    <View style={[styles.header, wide && styles.headerWide]}>
      <Pressable
        onPress={exit}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Cancel selection"
        style={styles.headerSide}
      >
        <Text variant="bodyMedium" color={colors.brandDeep}>
          Cancel
        </Text>
      </Pressable>
      <Text variant="sectionHeading" style={styles.count} accessibilityLiveRegion="polite">
        {label}
      </Text>
      <Pressable
        onPress={() => selectAll(listIds)}
        disabled={listIds.length === 0 || allSelected}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Select all tasks in this list"
        accessibilityState={{ disabled: listIds.length === 0 || allSelected }}
        style={styles.headerSide}
      >
        <Text
          variant="bodyMedium"
          color={listIds.length === 0 || allSelected ? colors.inkFaint : colors.brandDeep}
          style={styles.selectAll}
        >
          Select all
        </Text>
      </Pressable>
    </View>
  );
}

export function SelectionActionBar({ tasks }: { tasks: readonly TaskWithRefs[] }) {
  const insets = useSafeAreaInsets();
  const { active, selectedIds, count, exit } = useSelection();
  const bulk = useBulkUpdateTasks();
  const [assignOpen, setAssignOpen] = useState(false);

  if (!active) return null;

  const selected = tasks.filter((task) => selectedIds.has(task.id));
  const ids = selected.map((task) => task.id);
  const canComplete = selected.some((task) => task.status !== 'done');

  async function complete() {
    if (!canComplete || bulk.isPending) return;
    try {
      await bulk.mutateAsync({
        ids,
        status: 'done',
        celebrateCompletion: true,
      });
      exit();
    } catch (error) {
      showBulkError(error);
    }
  }

  return (
    <>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          onPress={() => setAssignOpen(true)}
          disabled={count === 0 || bulk.isPending}
          accessibilityRole="button"
          accessibilityLabel="Assign selected tasks"
          style={[styles.action, styles.assign, (count === 0 || bulk.isPending) && styles.disabled]}
        >
          <Ionicons name="person-outline" size={18} color={colors.ink} />
          <Text variant="bodyMedium">Assign</Text>
        </Pressable>
        <Pressable
          onPress={() => void complete()}
          disabled={!canComplete || bulk.isPending}
          accessibilityRole="button"
          accessibilityLabel="Complete selected tasks"
          style={[styles.action, styles.complete, (!canComplete || bulk.isPending) && styles.disabled]}
        >
          {bulk.isPending ? (
            <ActivityIndicator color={colors.onBrand} />
          ) : (
            <>
              <Ionicons name="checkmark" size={18} color={colors.onBrand} />
              <Text variant="bodyMedium" color={colors.onBrand}>
                Complete
              </Text>
            </>
          )}
        </Pressable>
      </View>
      <AssignSheet
        visible={assignOpen}
        tasks={selected}
        pending={bulk.isPending}
        onClose={() => setAssignOpen(false)}
        onApply={async (people) => {
          try {
            await bulk.mutateAsync({
              ids,
              setAssignees: true,
              assigneeIds: people.map((person) => person.userId),
              assignees: people.map((person) => ({
                id: person.userId,
                display_name: person.displayName,
                avatar_url: person.avatarUrl,
              })),
            });
            setAssignOpen(false);
            exit();
          } catch (error) {
            showBulkError(error);
          }
        }}
      />
    </>
  );
}

function AssignSheet({
  visible,
  tasks,
  pending,
  onClose,
  onApply,
}: {
  visible: boolean;
  tasks: readonly TaskWithRefs[];
  pending: boolean;
  onClose: () => void;
  onApply: (people: AssignablePerson[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const spaceIds = uniqueSpaceIds(tasks);
  const rosters = useQueries({
    queries: spaceIds.map((spaceId) => ({
      queryKey: qk.roster(spaceId),
      queryFn: () => fetchRoster(spaceId),
      enabled: visible && spaceIds.length > 0,
    })),
  });
  const loading = rosters.some((query) => query.isLoading);
  const failed = rosters.some((query) => query.isError);
  const people = peopleInEveryCircle(
    rosters.map((query) => (query.data ? rosterPeople(query.data) : [])),
  );
  const severalCircles = spaceIds.length > 1;
  const loaded = rosters.length > 0 && rosters.every((query) => query.isSuccess);
  const [picked, setPicked] = useState<string[] | null>(null);

  useEffect(() => {
    if (visible) setPicked(null);
  }, [visible]);

  const selectedIds = picked ?? sharedAssigneeIds(tasks);
  const everyEmpty = tasks.length > 0 && tasks.every((task) => task.assignees.length === 0);
  const unassignedSelected = selectedIds.length === 0 && (picked !== null || everyEmpty);

  function togglePerson(userId: string) {
    setPicked((current) => {
      const base = current ?? sharedAssigneeIds(tasks);
      return base.includes(userId) ? base.filter((id) => id !== userId) : [...base, userId];
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close assign" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.sheetHeader}>
            <Text variant="sectionHeading">Assign</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>

          <Text variant="meta" color={colors.inkSoft}>
            This replaces the assignees on every selected task.
          </Text>

          {severalCircles ? (
            <Text variant="meta" color={colors.inkSoft}>
              {loaded && people.length === 0
                ? 'These tasks are in more than one circle, and nobody belongs to all of them. You can still unassign them.'
                : 'These tasks are in more than one circle. Only people in every one of them are listed.'}
            </Text>
          ) : null}

          {loading ? <ActivityIndicator color={colors.brand} /> : null}
          {failed ? (
            <Text variant="meta" color={colors.priorityHigh}>
              Couldn’t load members. Try again.
            </Text>
          ) : null}

          <ScrollView style={styles.roster} contentContainerStyle={styles.rosterContent}>
            <AssignRow
              label="Unassigned"
              selected={unassignedSelected}
              disabled={pending}
              onPress={() => setPicked([])}
            />
            {people.map((person) => (
              <AssignRow
                key={person.userId}
                label={person.displayName ?? 'Member'}
                person={person}
                selected={selectedIds.includes(person.userId)}
                disabled={pending}
                onPress={() => togglePerson(person.userId)}
              />
            ))}
          </ScrollView>

          <Pressable
            onPress={() =>
              onApply(
                selectedIds.flatMap((id) => {
                  const person = people.find((candidate) => candidate.userId === id);
                  return person ? [person] : [];
                }),
              )
            }
            disabled={pending || loading || failed || !loaded}
            accessibilityRole="button"
            accessibilityLabel="Apply assignees"
            style={[styles.apply, (pending || loading || failed || !loaded) && styles.disabled]}
          >
            {pending ? (
              <ActivityIndicator color={colors.onBrand} />
            ) : (
              <Text variant="bodyMedium" color={colors.onBrand}>
                Apply
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function AssignRow({
  label,
  person,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  person?: AssignablePerson;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled }}
      accessibilityLabel={label}
      style={[styles.row, selected && styles.rowSelected, disabled && styles.disabled]}
    >
      {person ? (
        <Avatar name={person.displayName} uri={person.avatarUrl} size={28} />
      ) : (
        <View style={styles.unassignedIcon}>
          <Ionicons name="person-outline" size={16} color={colors.inkSoft} />
        </View>
      )}
      <Text variant="bodyMedium" style={styles.rowLabel}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.brandDeep} /> : null}
    </Pressable>
  );
}

function rosterPeople(roster: RosterMember[]): AssignablePerson[] {
  return roster.flatMap((member) =>
    member.profile
      ? [
          {
            userId: member.user_id,
            displayName: member.profile.display_name,
            avatarUrl: member.profile.avatar_url,
          },
        ]
      : [],
  );
}

function showBulkError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const detail = /not in every circle/i.test(message)
    ? 'Those people aren’t in every circle.'
    : 'Nothing was changed.';
  Toast.show({ type: 'error', text1: 'Couldn’t update those tasks', text2: detail });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  headerWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  headerSide: { minWidth: 76, paddingVertical: spacing.xs },
  count: { flex: 1, textAlign: 'center' },
  selectAll: { textAlign: 'right' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    ...shadows.floating,
  },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  assign: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.hairline },
  complete: { backgroundColor: colors.brand },
  apply: {
    minHeight: 48,
    borderRadius: radii.button,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  disabled: { opacity: 0.45 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43, 38, 32, 0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    maxHeight: '70%',
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  roster: { flexGrow: 0 },
  rosterContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  rowSelected: { backgroundColor: colors.brandSoft },
  rowLabel: { flex: 1 },
  unassignedIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
