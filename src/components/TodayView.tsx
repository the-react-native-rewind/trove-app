import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import Toast from 'react-native-toast-message';
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
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
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
  useDismissTodayItem,
  useMoveTodayItem,
  useMoveTodayItemToDay,
  useOpenTaskChoices,
  usePlaceTodayRoutine,
  useRenameTodayItem,
  useRestoreTodayItem,
  useSetTodayRepeat,
  useTodayList,
  useTomorrowPlan,
  useUpdateTodayRoutine,
} from '@/data/today';
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
  canRescheduleTodayLine,
  localToday,
  momentumCount,
  repeatLabel,
  shiftDay,
  todayLineTitle,
  weekdayIndex,
  withLinePatch,
  type TodayLine,
} from '@/lib/today';
import { resolveAccent, colors, radii, shadows, spacing, type as typeScale } from '@/theme/tokens';
import { CollapsingScreenHeader, useCollapsingHeader } from './CollapsingHeader';
import { MomentumBadge } from './MomentumBadge';
import { showUndoToast } from './ui/AppToast';
import { EmptyState } from './ui/EmptyState';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong. Try again.';
}

function quietError(title: string, error: unknown) {
  Toast.show({ type: 'error', text1: title, text2: messageOf(error) });
}

export function TodayView() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();
  const collapse = useCollapsingHeader(insets.top, 96);
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
  const activeQuery = planningTomorrow ? tomorrowQuery : todayQuery;
  const lines = activeQuery.data ?? [];
  const [refreshing, setRefreshing] = useState(false);
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
  const dismiss = useDismissTodayItem();
  const restore = useRestoreTodayItem();
  const taskChoices = useOpenTaskChoices(taskSearch, pickerOpen);
  const chime = useMomentumChime();
  const [tickPulse, setTickPulse] = useState(0);

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

  function submitDraft() {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text) return;
    setDraft('');
    hapticMedium();
    addText.mutate(text, {
      onError: (error) => {
        setDraft(text);
        quietError('Couldn’t add that line', error);
      },
    });
  }

  function pickTask(choice: { id: string; title: string; spaceName: string; spaceColor: string }) {
    setPickerOpen(false);
    setTaskSearch('');
    hapticMedium();
    addTask.mutate(
      {
        taskId: choice.id,
        title: choice.title,
        spaceName: choice.spaceName,
        spaceColor: choice.spaceColor,
      },
      { onError: (error) => quietError('Couldn’t add that task', error) },
    );
  }

  function selectDay(next: 'today' | 'tomorrow') {
    if (next === when) return;
    hapticLight();
    setWhen(next);
  }

  function countAfter(line: TodayLine, checked: boolean): number {
    const checkedAt = checked ? new Date().toISOString() : null;
    return momentumCount(withLinePatch(lines, line.id, { checkedAt }), today);
  }

  function onToggle(line: TodayLine) {
    if (planningTomorrow) return;
    if (line.checkedAt) {
      hapticLight();
      chime.setStep(countAfter(line, false));
      check.mutate(
        { id: line.id, checked: false },
        {
          onError: (error) => {
            chime.setStep(momentumCount(lines, today));
            quietError('Couldn’t update that line', error);
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
    setTickPulse((pulse) => pulse + 1);
    hapticSuccess();
    chime.play(countAfter(line, true));
    check.mutate(
      { id: line.id, checked: true },
      {
        onError: (error) => {
          chime.setStep(momentumCount(lines, today));
          quietError('Couldn’t update that line', error);
        },
      },
    );
  }

  function chooseTick(mode: 'today' | 'done') {
    const line = tickLine;
    const taskId = line?.taskId;
    if (!line || !taskId) return;
    setTickLine(null);
    const taskStatus = mode === 'done' ? 'done' : 'in_progress';
    setTickPulse((pulse) => pulse + 1);
    hapticSuccess();
    chime.play(countAfter(line, true));
    check.mutate(
      { id: line.id, checked: true, taskId, taskStatus },
      {
        onError: (error) => {
          chime.setStep(momentumCount(lines, today));
          quietError('Couldn’t update that task', error);
        },
      },
    );
  }

  function onDragEnd({ data, from, to }: DragEndParams<TodayLine>) {
    if (from === to) return;
    const dropped = data[to];
    if (!dropped) return;
    const nextRank = rankAfterDrop(data[to - 1]?.rank, data[to + 1]?.rank);
    if (nextRank === dropped.rank) return;
    const next = data.map((line) => (line.id === dropped.id ? { ...line, rank: nextRank } : line));
    const scope = planningTomorrow ? 'tomorrow' : 'today';
    const onError = (error: unknown) => quietError('Couldn’t reorder that line', error);
    if (dropped.virtual && dropped.routineId) {
      updateRoutine.mutate(
        { id: dropped.routineId, rank: nextRank, day: activeDay, scope, lines: next },
        { onError },
      );
      return;
    }
    move.mutate({ id: dropped.id, rank: nextRank, day: activeDay, scope, lines: next }, { onError });
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

  function saveRepeat() {
    if (!repeatLine) return;
    const days = repeatMask();
    if (!isRepeatMask(days)) {
      alertDialog('Pick at least one day');
      return;
    }
    const line = repeatLine;
    setRepeatLine(null);
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, days })
        : setRepeat.mutateAsync({ id: line.id, days });
    void pending.catch((error) => quietError('Couldn’t save that repeat', error));
  }

  function stopRepeat() {
    if (!repeatLine) return;
    const line = repeatLine;
    setRepeatLine(null);
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, active: false })
        : setRepeat.mutateAsync({ id: line.id, days: 0 });
    void pending.catch((error) => quietError('Couldn’t stop that repeat', error));
  }

  function saveEdit() {
    if (!editLine) return;
    const text = editDraft.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const line = editLine;
    setEditLine(null);
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, text })
        : rename.mutateAsync({ id: line.id, text });
    void pending.catch((error) => quietError('Couldn’t save that line', error));
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
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, active: false })
        : remove.mutateAsync(line.id);
    void pending.catch((error) => quietError('Couldn’t delete that line', error));
  }

  function routineAlreadyToday(line: TodayLine): boolean {
    if (!line.routineId) return false;
    return (todayQuery.data ?? []).some((item) => item.routineId === line.routineId);
  }

  function moveLine(line: TodayLine) {
    setMenuLine(null);
    const pending = planningTomorrow
      ? line.virtual && line.routineId
        ? placeRoutine.mutateAsync(line.routineId)
        : moveDay.mutateAsync({ id: line.id, day: today })
      : moveDay.mutateAsync({ id: line.id, day: tomorrow });
    void pending.catch((error) => quietError('Couldn’t move that line', error));
  }

  function planLine(line: TodayLine, action: 'tomorrow' | 'not-today') {
    setMenuLine(null);
    if (!canRescheduleTodayLine(line)) return;
    if (action === 'tomorrow') {
      moveDay.mutate(
        { id: line.id, day: tomorrow },
        {
          onSuccess: () => {
            showUndoToast('Moved to tomorrow', () => {
              moveDay.mutate(
                { id: line.id, day: today },
                { onError: (error) => quietError('Couldn’t undo that', error) },
              );
            });
          },
          onError: (error) => quietError('Couldn’t move that line', error),
        },
      );
      return;
    }
    dismiss.mutate(line.id, {
      onSuccess: () => {
        showUndoToast('Off today', () => {
          restore.mutate(line, { onError: (error) => quietError('Couldn’t undo that', error) });
        });
      },
      onError: (error) => quietError('Couldn’t take that off today', error),
    });
  }

  function renderLine(line: TodayLine, drag?: () => void, isActive?: boolean) {
    const title = todayLineTitle(line);
    const checked = line.checkedAt !== null;
    const shiftable = !planningTomorrow && canRescheduleTodayLine(line);
    return (
      <TodayLineRow
        line={line}
        title={title}
        checked={checked}
        shiftable={shiftable}
        showHoverMenu={isWide && Platform.OS === 'web'}
        isActive={isActive}
        drag={drag}
        onToggle={() => onToggle(line)}
        onOpen={() => {
          if (line.taskId) router.push(`/task/${line.taskId}` as never);
        }}
        onOpenMenu={() => {
          hapticLight();
          setMenuLine(line);
        }}
        onTomorrow={() => planLine(line, 'tomorrow')}
        onNotToday={() => planLine(line, 'not-today')}
        planningTomorrow={planningTomorrow}
      />
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

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void activeQuery.refetch().finally(() => setRefreshing(false));
      }}
      tintColor={colors.brand}
    />
  );

  const repeatDays = repeatMask();
  const repeatLeaves =
    repeatLine !== null &&
    repeatLine.checkedAt === null &&
    isRepeatMask(repeatDays) &&
    !dayMatches(repeatDays, repeatLine.day);

  const listPad = { paddingTop: collapse.contentOffset };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <CollapsingScreenHeader
        topInset={insets.top}
        onLayout={collapse.onLayout}
        animatedStyle={collapse.animatedStyle}
        pointerEvents={collapse.pointerEvents}
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
            <Text variant="screenTitle" numberOfLines={1}>
              {planningTomorrow ? 'Tomorrow' : 'Today'}
            </Text>
          </View>
          {planningTomorrow ? null : (
            <MomentumBadge count={momentumCount(todayQuery.data ?? [], today)} pulse={tickPulse} />
          )}
        </View>
        <View style={[styles.switchRow, isWide && styles.switchWide]}>
          <DaySwitch label="Today" selected={!planningTomorrow} onPress={() => selectDay('today')} />
          <DaySwitch label="Tomorrow" selected={planningTomorrow} onPress={() => selectDay('tomorrow')} />
        </View>
      </CollapsingScreenHeader>

      <View style={styles.listFrame}>
        {activeQuery.data === undefined && !activeQuery.isError ? (
          <View style={[styles.center, listPad]}>
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
            onScrollOffsetChange={collapse.onScrollOffsetChange}
            ListEmptyComponent={empty}
            contentContainerStyle={[
              lines.length === 0 ? styles.emptyList : styles.listContent,
              listPad,
            ]}
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
        {!planningTomorrow && menuLine && canRescheduleTodayLine(menuLine) ? (
          <SheetAction
            label="Tomorrow"
            detail="Shows up tomorrow"
            onPress={() => menuLine && planLine(menuLine, 'tomorrow')}
          />
        ) : null}
        {!planningTomorrow && menuLine && canRescheduleTodayLine(menuLine) ? (
          <SheetAction
            label="Not today"
            detail={menuLine.taskId ? 'Stays in the circle. The due date stays.' : 'Leaves this day'}
            onPress={() => menuLine && planLine(menuLine, 'not-today')}
          />
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
          accessibilityLabel="Search tasks"
        />
        {taskChoices.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
        {taskChoices.isError ? (
          <Text variant="meta" color={colors.priorityHigh}>
            Couldn’t load tasks. Try again.
          </Text>
        ) : null}
        <ScrollView
          style={styles.choiceList}
          contentContainerStyle={styles.taskChoices}
          keyboardShouldPersistTaps="handled"
        >
          {choices.map((choice) => (
            <Pressable
              key={choice.id}
              onPress={() => pickTask(choice)}
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

function TodayLineRow({
  line,
  title,
  checked,
  shiftable,
  showHoverMenu,
  isActive,
  drag,
  planningTomorrow,
  onToggle,
  onOpen,
  onOpenMenu,
  onTomorrow,
  onNotToday,
}: {
  line: TodayLine;
  title: string;
  checked: boolean;
  shiftable: boolean;
  showHoverMenu: boolean;
  isActive?: boolean;
  drag?: () => void;
  planningTomorrow: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onOpenMenu: () => void;
  onTomorrow: () => void;
  onNotToday: () => void;
}) {
  const ref = useRef<SwipeableMethods>(null);
  const [hovered, setHovered] = useState(false);
  const contextMenu =
    Platform.OS === 'web'
      ? {
          onContextMenu: (event: { preventDefault?: () => void }) => {
            event.preventDefault?.();
            onOpenMenu();
          },
        }
      : undefined;

  const row = (
    <View
      style={[styles.row, isActive && styles.rowActive]}
      {...(showHoverMenu
        ? {
            onPointerEnter: () => setHovered(true),
            onPointerLeave: () => setHovered(false),
          }
        : null)}
      {...contextMenu}
    >
      <Pressable
        onPress={onToggle}
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
        onPress={onOpen}
        onLongPress={onOpenMenu}
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
      {showHoverMenu && hovered ? (
        <Pressable
          onPress={onOpenMenu}
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${title}`}
          hitSlop={4}
          style={styles.rowMenu}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
        </Pressable>
      ) : null}
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

  if (!shiftable) return row;

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={36}
      dragOffsetFromRightEdge={48}
      overshootRight={false}
      onSwipeableWillOpen={() => hapticLight()}
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            onPress={() => {
              ref.current?.close();
              hapticLight();
              onTomorrow();
            }}
            accessibilityRole="button"
            accessibilityLabel="Tomorrow"
            style={[styles.swipeAction, styles.swipeTomorrow]}
          >
            <Text variant="meta" color={colors.brandDeep}>
              Tomorrow
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              ref.current?.close();
              hapticLight();
              onNotToday();
            }}
            accessibilityRole="button"
            accessibilityLabel="Not today"
            style={[styles.swipeAction, styles.swipeNotToday]}
          >
            <Text variant="meta" color={colors.ink}>
              Not today
            </Text>
          </Pressable>
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
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
  titleBlock: { flex: 1 },
  switchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  switchWide: { paddingHorizontal: spacing.xl },
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
  rowMenu: {
    position: 'absolute',
    right: 44,
    top: 0,
    bottom: 0,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
  },
  swipeAction: {
    minWidth: 104,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeTomorrow: { backgroundColor: colors.brandSoft },
  swipeNotToday: { backgroundColor: colors.surfaceAlt },
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
  taskChoices: { gap: spacing.sm },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  dayChipOn: { backgroundColor: colors.brandSoft },
});
