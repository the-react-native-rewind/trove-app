import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useAddTodayTask,
  useAddTodayText,
  useCheckTodayItem,
  useDeleteTodayItem,
  useMoveTodayItem,
  useMoveTodayItemToDay,
  useOpenTaskChoices,
  usePlaceTodayRoutine,
  useRenameTodayItem,
  useSetTodayRepeat,
  useTodayList,
  useTomorrowPlan,
  useUpdateTodayRoutine,
} from '@/data/today';
import { useMoveTaskStatus } from '@/data/tasks';
import { useIsWide } from '@/hooks/useIsWide';
import { alertDialog, confirmDialog } from '@/lib/dialog';
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess } from '@/lib/haptics';
import { useMomentumChime } from '@/lib/momentumSound';
import { rankAfterDrop } from '@/lib/rank';
import {
  EVERY_DAY,
  WEEKDAY_PICKER_ORDER,
  WEEKDAY_SHORT,
  WEEKDAYS,
  dayMatches,
  daysFromWeekdays,
  isRepeatMask,
  localToday,
  momentumCount,
  repeatLabel,
  shiftDay,
  todayLineTitle,
  weekdayIndex,
  type TodayLine,
} from '@/lib/today';
import { resolveAccent, colors, radii, shadows, spacing, type as typeScale } from '@/theme/tokens';
import { MomentumBadge } from './MomentumBadge';
import { EmptyState } from './ui/EmptyState';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function friendlyDay(iso: string): string {
  const index = weekdayIndex(iso);
  const [, monthText, dayText] = iso.split('-');
  const month = MONTHS[Number(monthText) - 1] ?? '';
  const weekday = index === null ? '' : WEEKDAY_SHORT[index];
  return `${weekday} ${Number(dayText)} ${month}`.trim();
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

export function TodayView() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const today = localToday();
  const tomorrow = shiftDay(today, 1);
  const [when, setWhen] = useState<'today' | 'tomorrow'>('today');
  const [draft, setDraft] = useState('');
  const [menuLine, setMenuLine] = useState<TodayLine | null>(null);
  const [editLine, setEditLine] = useState<TodayLine | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [repeatLine, setRepeatLine] = useState<TodayLine | null>(null);
  const [repeatChoice, setRepeatChoice] = useState<'every' | 'weekdays' | 'custom'>('every');
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [tickLine, setTickLine] = useState<TodayLine | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');

  const planningTomorrow = when === 'tomorrow';
  const activeDay = planningTomorrow ? tomorrow : today;
  const todayQuery = useTodayList(today);
  const tomorrowQuery = useTomorrowPlan(tomorrow);
  const [lines, setLines] = useState<TodayLine[]>(() => todayQuery.data ?? []);
  const activeQuery = planningTomorrow ? tomorrowQuery : todayQuery;
  const addText = useAddTodayText(activeDay);
  const addTask = useAddTodayTask(activeDay);
  const check = useCheckTodayItem();
  const move = useMoveTodayItem();
  const moveDay = useMoveTodayItemToDay();
  const placeRoutine = usePlaceTodayRoutine();
  const updateRoutine = useUpdateTodayRoutine();
  const rename = useRenameTodayItem();
  const setRepeat = useSetTodayRepeat();
  const remove = useDeleteTodayItem();
  const moveStatus = useMoveTaskStatus();
  const taskChoices = useOpenTaskChoices(taskSearch, pickerOpen);
  const playChime = useMomentumChime();
  const [tickPulse, setTickPulse] = useState(0);

  useEffect(() => {
    if (activeQuery.data) setLines(activeQuery.data);
  }, [when, activeQuery.data]);

  const takenTaskIds = new Set(lines.flatMap((line) => (line.taskId ? [line.taskId] : [])));
  const choices = (taskChoices.data ?? []).filter((choice) => !takenTaskIds.has(choice.id));

  function openDrawer() {
    (navigation as unknown as { openDrawer: () => void }).openDrawer();
  }

  function onDraftChange(value: string) {
    if (value.includes('@')) {
      setDraft(value.replaceAll('@', ''));
      setPickerOpen(true);
      hapticLight();
      return;
    }
    setDraft(value);
  }

  async function submitDraft() {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text) return;
    setDraft('');
    try {
      hapticMedium();
      await addText.mutateAsync(text);
    } catch (error) {
      setDraft(text);
      alertDialog('Couldn’t add that line', messageOf(error));
    }
  }

  async function pickTask(taskId: string) {
    try {
      hapticMedium();
      await addTask.mutateAsync(taskId);
      setPickerOpen(false);
      setTaskSearch('');
    } catch (error) {
      alertDialog('Couldn’t add that task', messageOf(error));
    }
  }

  function selectDay(next: 'today' | 'tomorrow') {
    if (next === when) return;
    hapticLight();
    setWhen(next);
    const nextLines = next === 'tomorrow' ? (tomorrowQuery.data ?? []) : (todayQuery.data ?? []);
    setLines(nextLines);
  }

  function patchChecked(id: string, checkedAt: string | null) {
    setLines((current) => current.map((item) => (item.id === id ? { ...item, checkedAt } : item)));
  }

  function commitTick(line: TodayLine) {
    patchChecked(line.id, new Date().toISOString());
    setTickPulse((pulse) => pulse + 1);
    hapticSuccess();
    playChime();
  }

  function onToggle(line: TodayLine) {
    if (planningTomorrow) return;
    if (line.checkedAt) {
      hapticLight();
      patchChecked(line.id, null);
      check.mutate(
        { id: line.id, checked: false },
        {
          onError: (error) => {
            patchChecked(line.id, line.checkedAt);
            alertDialog('Couldn’t update that line', messageOf(error));
          },
        },
      );
      return;
    }
    if (line.taskId) {
      hapticLight();
      setTickLine(line);
      return;
    }
    commitTick(line);
    check.mutate(
      { id: line.id, checked: true },
      {
        onError: (error) => {
          patchChecked(line.id, null);
          alertDialog('Couldn’t update that line', messageOf(error));
        },
      },
    );
  }

  async function chooseTick(mode: 'today' | 'done') {
    const line = tickLine;
    const taskId = line?.taskId;
    if (!line || !taskId) return;
    setTickLine(null);
    commitTick(line);
    try {
      await moveStatus.mutateAsync({
        id: taskId,
        status: mode === 'done' ? 'done' : 'in_progress',
        celebrateCompletion: false,
      });
      await check.mutateAsync({ id: line.id, checked: true });
    } catch (error) {
      patchChecked(line.id, null);
      alertDialog('Couldn’t update that task', messageOf(error));
    }
  }

  function onDragEnd({ data, from, to }: DragEndParams<TodayLine>) {
    if (from === to) return;
    const dropped = data[to];
    if (!dropped) return;
    const nextRank = rankAfterDrop(data[to - 1]?.rank, data[to + 1]?.rank);
    if (nextRank === dropped.rank) return;
    setLines(data.map((line) => (line.id === dropped.id ? { ...line, rank: nextRank } : line)));
    const refetch = () => void activeQuery.refetch();
    if (dropped.virtual && dropped.routineId) {
      updateRoutine.mutate({ id: dropped.routineId, rank: nextRank }, { onError: refetch });
      return;
    }
    move.mutate({ id: dropped.id, rank: nextRank }, { onError: refetch });
  }

  function openRepeat(line: TodayLine) {
    const days = line.routineActive ? line.repeatDays : null;
    if (days === EVERY_DAY) setRepeatChoice('every');
    else if (days === WEEKDAYS) setRepeatChoice('weekdays');
    else if (days) {
      setRepeatChoice('custom');
      setCustomDays(WEEKDAY_PICKER_ORDER.filter((index) => (days & (1 << index)) !== 0));
    } else {
      setRepeatChoice('every');
      const todayIndex = weekdayIndex(line.day);
      setCustomDays(todayIndex === null ? [1, 2, 3, 4, 5] : [todayIndex]);
    }
    setMenuLine(null);
    setRepeatLine(line);
  }

  function repeatMask(): number {
    if (repeatChoice === 'every') return EVERY_DAY;
    if (repeatChoice === 'weekdays') return WEEKDAYS;
    return daysFromWeekdays(customDays);
  }

  async function saveRepeat() {
    if (!repeatLine) return;
    const days = repeatMask();
    if (!isRepeatMask(days)) {
      alertDialog('Pick at least one day');
      return;
    }
    try {
      if (repeatLine.virtual && repeatLine.routineId) {
        await updateRoutine.mutateAsync({ id: repeatLine.routineId, days });
      } else {
        await setRepeat.mutateAsync({ id: repeatLine.id, days });
      }
      setRepeatLine(null);
    } catch (error) {
      alertDialog('Couldn’t save that repeat', messageOf(error));
    }
  }

  async function stopRepeat() {
    if (!repeatLine) return;
    try {
      if (repeatLine.virtual && repeatLine.routineId) {
        await updateRoutine.mutateAsync({ id: repeatLine.routineId, active: false });
      } else {
        await setRepeat.mutateAsync({ id: repeatLine.id, days: 0 });
      }
      setRepeatLine(null);
    } catch (error) {
      alertDialog('Couldn’t stop that repeat', messageOf(error));
    }
  }

  async function saveEdit() {
    if (!editLine) return;
    const text = editDraft.replace(/\s+/g, ' ').trim();
    if (!text) return;
    try {
      if (editLine.virtual && editLine.routineId) {
        await updateRoutine.mutateAsync({ id: editLine.routineId, text });
      } else {
        await rename.mutateAsync({ id: editLine.id, text });
      }
      setEditLine(null);
    } catch (error) {
      alertDialog('Couldn’t save that line', messageOf(error));
    }
  }

  async function deleteLine(line: TodayLine) {
    setMenuLine(null);
    const repeating = line.routineId !== null && line.routineActive;
    const ok = await confirmDialog({
      title: repeating ? 'Delete this repeating line?' : 'Delete this line?',
      message: repeating
        ? line.virtual
          ? 'It won’t come back on later days.'
          : planningTomorrow
            ? 'It leaves tomorrow, and it won’t come back on later days.'
            : 'It leaves today, and it won’t come back on later days.'
        : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      if (line.virtual && line.routineId) {
        await updateRoutine.mutateAsync({ id: line.routineId, active: false });
      } else {
        await remove.mutateAsync(line.id);
      }
    } catch (error) {
      alertDialog('Couldn’t delete that line', messageOf(error));
    }
  }

  function routineAlreadyToday(line: TodayLine): boolean {
    if (!line.routineId) return false;
    return (todayQuery.data ?? []).some((item) => item.routineId === line.routineId);
  }

  async function moveLine(line: TodayLine) {
    setMenuLine(null);
    try {
      if (planningTomorrow) {
        if (line.virtual && line.routineId) await placeRoutine.mutateAsync(line.routineId);
        else await moveDay.mutateAsync({ id: line.id, day: today });
      } else {
        await moveDay.mutateAsync({ id: line.id, day: tomorrow });
      }
    } catch (error) {
      alertDialog('Couldn’t move that line', messageOf(error));
    }
  }

  function renderLine(line: TodayLine, drag?: () => void, isActive?: boolean) {
    const title = todayLineTitle(line);
    const checked = line.checkedAt !== null;
    return (
      <View style={[styles.row, isActive && styles.rowActive]}>
        <Pressable
          onPress={() => onToggle(line)}
          disabled={planningTomorrow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: planningTomorrow }}
          accessibilityLabel={checked ? `Untick ${title}` : `Tick ${title}`}
          hitSlop={6}
          style={styles.checkbox}
        >
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? colors.brand : colors.inkFaint}
          />
        </Pressable>
        <Pressable
          style={styles.rowBody}
          onPress={() => {
            if (line.taskId) router.push(`/task/${line.taskId}` as never);
          }}
          onLongPress={() => {
            hapticLight();
            setMenuLine(line);
          }}
          delayLongPress={350}
          accessibilityRole={line.taskId ? 'button' : 'text'}
          accessibilityLabel={title}
        >
          <Text
            variant="body"
            color={checked ? colors.inkFaint : colors.ink}
            style={checked ? styles.checkedText : undefined}
            numberOfLines={2}
          >
            {title}
          </Text>
          {line.routineId || line.spaceName ? (
            <View style={styles.metaRow}>
              {line.routineId ? (
                <Ionicons name="repeat" size={13} color={colors.inkFaint} accessibilityLabel="Repeats" />
              ) : null}
              {line.spaceName ? (
                <View style={styles.circleBadge}>
                  <AccentDot color={line.spaceColor ?? 'sage'} size={8} />
                  <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                    {line.spaceName}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </Pressable>
        {drag ? (
          <Pressable
            onPressIn={drag}
            accessibilityRole="button"
            accessibilityLabel={`Drag to reorder ${title}`}
            hitSlop={4}
            style={styles.handle}
          >
            <Ionicons name="reorder-three" size={22} color={colors.inkFaint} />
          </Pressable>
        ) : (
          <View style={styles.handle} />
        )}
      </View>
    );
  }

  const empty = (
    <EmptyState
      icon={activeQuery.isError ? 'cloud-offline-outline' : 'sunny-outline'}
      title={
        activeQuery.isError
          ? planningTomorrow
            ? 'Couldn’t load tomorrow'
            : 'Couldn’t load today'
          : planningTomorrow
            ? 'Nothing planned'
            : 'A clear day'
      }
      body={
        activeQuery.isError
          ? 'Pull to refresh and try again.'
          : planningTomorrow
            ? 'Write a line for tomorrow. Routines that fall on that day show here too.'
            : 'Write a line at the bottom. Type @ to pull in a task.'
      }
    />
  );

  const listHeader = planningTomorrow ? (
    <Text variant="meta" color={colors.inkSoft} style={styles.planNote}>
      A plan. Lines you still finish today stay there until tomorrow arrives.
    </Text>
  ) : null;

  const refresh = (
    <RefreshControl
      refreshing={activeQuery.isRefetching}
      onRefresh={() => void activeQuery.refetch()}
      tintColor={colors.brand}
    />
  );

  const repeatDays = repeatMask();
  const repeatLeaves =
    repeatLine !== null &&
    repeatLine.checkedAt === null &&
    isRepeatMask(repeatDays) &&
    !dayMatches(repeatDays, repeatLine.day);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, isWide && styles.headerWide]}>
        {!isWide ? (
          <Pressable
            onPress={openDrawer}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open circles"
            style={styles.iconButton}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <Text variant="screenTitle">{planningTomorrow ? 'Tomorrow' : 'Today'}</Text>
          <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
            {planningTomorrow ? `A plan · ${friendlyDay(tomorrow)}` : `Just for you · ${friendlyDay(today)}`}
          </Text>
        </View>
        {planningTomorrow ? null : (
          <MomentumBadge count={momentumCount(lines, today)} pulse={tickPulse} />
        )}
      </View>
      <View style={[styles.switchRow, isWide && styles.headerWide]}>
        <DaySwitch label="Today" selected={!planningTomorrow} onPress={() => selectDay('today')} />
        <DaySwitch label="Tomorrow" selected={planningTomorrow} onPress={() => selectDay('tomorrow')} />
      </View>

      <View style={styles.listFrame}>
        {activeQuery.isLoading && !activeQuery.data ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <DraggableFlatList
            data={lines}
            keyExtractor={(line) => line.id}
            renderItem={({ item, drag, isActive }: RenderItemParams<TodayLine>) =>
              renderLine(item, drag, isActive)
            }
            activationDistance={8}
            onDragBegin={() => hapticLight()}
            onDragEnd={onDragEnd}
            ListHeaderComponent={listHeader}
            ListEmptyComponent={empty}
            contentContainerStyle={lines.length === 0 ? styles.emptyList : styles.listContent}
            refreshControl={refresh}
            containerStyle={styles.listFrame}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            onSubmitEditing={() => void submitDraft()}
            placeholder={planningTomorrow ? 'Add a line for tomorrow' : 'Add a line, or @ a task'}
            placeholderTextColor={colors.inkFaint}
            returnKeyType="done"
            blurOnSubmit={false}
            style={styles.input}
            accessibilityLabel="Add a line"
          />
          <Pressable
            onPress={() => {
              hapticLight();
              setPickerOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Add a task"
            style={styles.taskButton}
          >
            <Ionicons name="checkbox-outline" size={18} color={colors.brandDeep} />
            <Text variant="meta" color={colors.brandDeep}>
              Task
            </Text>
          </Pressable>
        </View>

      <Sheet
        visible={menuLine !== null}
        title={menuLine ? todayLineTitle(menuLine) : ''}
        wide={isWide}
        onClose={() => setMenuLine(null)}
      >
        <SheetAction
          label={menuLine?.taskId ? 'Open task' : 'Edit'}
          onPress={() => {
            const line = menuLine;
            setMenuLine(null);
            if (!line) return;
            if (line.taskId) {
              router.push(`/task/${line.taskId}` as never);
              return;
            }
            setEditDraft(line.text ?? '');
            setEditLine(line);
          }}
        />
        <SheetAction
          label={menuLine?.routineActive ? `Repeat · ${repeatLabel(menuLine.repeatDays ?? EVERY_DAY)}` : 'Repeat'}
          onPress={() => {
            if (menuLine) openRepeat(menuLine);
          }}
        />
        {!planningTomorrow && menuLine && !menuLine.checkedAt ? (
          <SheetAction label="Move to tomorrow" onPress={() => menuLine && void moveLine(menuLine)} />
        ) : null}
        {planningTomorrow && menuLine && !(menuLine.virtual && routineAlreadyToday(menuLine)) ? (
          <SheetAction label="Move to today" onPress={() => menuLine && void moveLine(menuLine)} />
        ) : null}
        <SheetAction label="Delete" destructive onPress={() => menuLine && void deleteLine(menuLine)} />
      </Sheet>

      <Sheet
        visible={editLine !== null}
        title="Edit line"
        wide={isWide}
        onClose={() => setEditLine(null)}
      >
        <TextInput
          value={editDraft}
          onChangeText={setEditDraft}
          onSubmitEditing={() => void saveEdit()}
          placeholder="The line"
          placeholderTextColor={colors.inkFaint}
          style={styles.sheetInput}
          autoFocus
          accessibilityLabel="Line text"
        />
        <SheetAction label="Save" onPress={() => void saveEdit()} />
      </Sheet>

      <Sheet
        visible={repeatLine !== null}
        title="Repeat"
        wide={isWide}
        onClose={() => setRepeatLine(null)}
      >
        <ChoiceRow label="Every day" selected={repeatChoice === 'every'} onPress={() => setRepeatChoice('every')} />
        <ChoiceRow label="Weekdays" selected={repeatChoice === 'weekdays'} onPress={() => setRepeatChoice('weekdays')} />
        <ChoiceRow label="Specific days" selected={repeatChoice === 'custom'} onPress={() => setRepeatChoice('custom')} />
        {repeatChoice === 'custom' ? (
          <View style={styles.dayRow}>
            {WEEKDAY_PICKER_ORDER.map((index) => {
              const selected = customDays.includes(index);
              return (
                <Pressable
                  key={index}
                  onPress={() => {
                    hapticSelection();
                    setCustomDays((current) =>
                      current.includes(index) ? current.filter((day) => day !== index) : [...current, index],
                    );
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={WEEKDAY_SHORT[index]}
                  style={[styles.dayChip, selected && styles.dayChipOn]}
                >
                  <Text variant="meta" color={selected ? colors.brandDeep : colors.inkSoft}>
                    {WEEKDAY_SHORT[index]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {repeatLeaves ? (
          <Text variant="meta" color={colors.inkSoft}>
            This day isn’t included, so the line leaves today and comes back on the days you picked.
          </Text>
        ) : null}
        <SheetAction label="Save" onPress={() => void saveRepeat()} />
        {repeatLine?.routineActive ? (
          <SheetAction label="Stop repeating" onPress={() => void stopRepeat()} />
        ) : null}
      </Sheet>

      <Sheet
        visible={tickLine !== null}
        title={tickLine ? todayLineTitle(tickLine) : ''}
        wide={isWide}
        onClose={() => setTickLine(null)}
      >
        <Text variant="meta" color={colors.inkSoft}>
          Ticking this also updates the task. Unticking later only clears the line.
        </Text>
        <SheetAction
          label="Done for today"
          detail="Keep the task in progress"
          quiet
          onPress={() => void chooseTick('today')}
        />
        <SheetAction label="Finished" detail="Mark the task done" quiet onPress={() => void chooseTick('done')} />
      </Sheet>

      <Sheet visible={pickerOpen} title="Add a task" wide={isWide} onClose={() => setPickerOpen(false)}>
        <TextInput
          value={taskSearch}
          onChangeText={setTaskSearch}
          placeholder="Search your open tasks"
          placeholderTextColor={colors.inkFaint}
          style={styles.sheetInput}
          autoFocus
          accessibilityLabel="Search tasks"
        />
        {taskChoices.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
        {taskChoices.isError ? (
          <Text variant="meta" color={colors.priorityHigh}>
            Couldn’t load tasks. Try again.
          </Text>
        ) : null}
        <ScrollView style={styles.choiceList} keyboardShouldPersistTaps="handled">
          {choices.map((choice) => (
            <Pressable
              key={choice.id}
              onPress={() => void pickTask(choice.id)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${choice.title}`}
              style={styles.choice}
            >
              <Text variant="body" numberOfLines={2} style={styles.choiceTitle}>
                {choice.title}
              </Text>
              <View style={styles.circleBadge}>
                <AccentDot color={resolveAccent(choice.spaceColor)} size={8} />
                <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                  {choice.spaceName}
                </Text>
              </View>
            </Pressable>
          ))}
          {!taskChoices.isLoading && choices.length === 0 ? (
            <Text variant="meta" color={colors.inkSoft}>
              No open tasks match.
            </Text>
          ) : null}
        </ScrollView>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function DaySwitch({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={[styles.switchItem, selected && styles.switchOn]}
    >
      <Text variant="bodyMedium" color={selected ? colors.brandDeep : colors.inkSoft}>
        {label}
      </Text>
    </Pressable>
  );
}

function Sheet({
  visible,
  title,
  wide,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  wide: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.backdrop, wide && styles.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View
          style={[
            styles.sheet,
            wide && styles.sheetWide,
            { paddingBottom: Math.max(insets.bottom, spacing.lg) },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text variant="sectionHeading" numberOfLines={2} style={styles.sheetTitle}>
              {title}
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({
  label,
  detail,
  destructive,
  quiet,
  onPress,
}: {
  label: string;
  detail?: string;
  destructive?: boolean;
  quiet?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (!quiet) hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.sheetAction}
    >
      <Text variant="bodyMedium" color={destructive ? colors.priorityHigh : colors.ink}>
        {label}
      </Text>
      {detail ? (
        <Text variant="meta" color={colors.inkFaint}>
          {detail}
        </Text>
      ) : null}
    </Pressable>
  );
}

function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.choice, selected && styles.choiceOn]}
    >
      <Text variant="bodyMedium" style={styles.choiceTitle}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.brandDeep} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerWide: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  iconButton: { padding: spacing.xs },
  titleBlock: { flex: 1, gap: 2 },
  switchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  switchItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  switchOn: { backgroundColor: colors.brandSoft },
  listFrame: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: spacing.lg },
  emptyList: { flexGrow: 1 },
  planNote: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowActive: { backgroundColor: colors.surface, ...shadows.floating },
  checkbox: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, paddingVertical: spacing.sm, gap: 2 },
  checkedText: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  circleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  handle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    backgroundColor: colors.paper,
  },
  input: {
    flex: 1,
    minHeight: 44,
    color: colors.ink,
    ...typeScale.body,
  },
  taskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.brandSoft,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(43, 38, 32, 0.35)' },
  backdropWide: { justifyContent: 'center', padding: spacing.xl },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    maxHeight: '80%',
  },
  sheetWide: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: radii.lg,
    ...shadows.floating,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sheetTitle: { flex: 1 },
  sheetAction: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
    gap: 2,
  },
  sheetInput: {
    minHeight: 44,
    color: colors.ink,
    backgroundColor: colors.paper,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    ...typeScale.body,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  choiceOn: { backgroundColor: colors.brandSoft },
  choiceTitle: { flex: 1 },
  choiceList: { flexGrow: 0 },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  dayChipOn: { backgroundColor: colors.brandSoft },
});
