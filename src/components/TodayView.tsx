import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Toast from 'react-native-toast-message';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import DraggableFlatList, {
  type DragEndParams,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useAddTodayTask,
  useAddTodayText,
  useCheckTodayItem,
  useConvertTodayItem,
  useDeleteTodayItem,
  useDismissTodayItem,
  useDismissTodaySuggestion,
  useMoveTodayItem,
  useMoveTodayItemToDay,
  useOpenTaskChoices,
  usePlaceTodayRoutine,
  useRenameTodayItem,
  useRestoreTodayItem,
  useSetTodayRepeat,
  useSkipTodayRoutine,
  useTodayList,
  useTodaySuggestions,
  useTomorrowPlan,
  useUpdateTodayRoutine,
  useYesterdayList,
  type TodaySuggestion,
} from '@/data/today';
import { useSpaces } from '@/data/spaces';
import { useIsWide } from '@/hooks/useIsWide';
import { alertDialog, confirmDialog } from '@/lib/dialog';
import { formatDayLabel } from '@/lib/format';
import { celebrate } from '@/lib/celebrate';
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
  canMakeTodayAction,
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
import { canWrite } from '@/lib/types';
import { resolveAccent, colors, radii, shadows, spacing, type as typeScale } from '@/theme/tokens';
import { CollapsingScreenHeader, useCollapsingHeader } from './CollapsingHeader';
import { showUndoToast } from './ui/AppToast';
import { EmptyState } from './ui/EmptyState';
import { FadeSheet, SheetBottom } from './ui/FadeSheet';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

const EMPTY_TODAY_LINES: TodayLine[] = [];

const MAX_FUTURE = 10; // how many days ahead you can plan
const MAX_PAST = 365; // generous backward bound; empty days just read empty

// The add-action list scrolls under a pinned title + search; capped so the
// header stays on screen when the keyboard is up.
const PICKER_LIST_MAX = Math.round(Dimensions.get('window').height * 0.56);

type DayScope = 'yesterday' | 'today' | 'tomorrow';

/** Map a day offset to the data-layer scope: past reads like yesterday, future like tomorrow. */
function scopeForOffset(offset: number): DayScope {
  if (offset < 0) return 'yesterday';
  if (offset > 0) return 'tomorrow';
  return 'today';
}

function dayPanGesture(step: (delta: number) => void) {
  return Gesture.Pan()
    .activeOffsetX([-32, 32])
    .failOffsetY([-18, 18])
    .onEnd((event) => {
      const forward = event.translationX < -48 || event.velocityX < -700;
      const back = event.translationX > 48 || event.velocityX > 700;
      if (forward && !back) runOnJS(step)(1);
      else if (back && !forward) runOnJS(step)(-1);
    });
}

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
  const collapse = useCollapsingHeader(insets.top, 64);
  const today = localToday();
  const tomorrow = shiftDay(today, 1);
  const [dayOffset, setDayOffset] = useState(0);
  const activeDay = shiftDay(today, dayOffset);
  const viewingToday = dayOffset === 0;
  const viewingPast = dayOffset < 0;
  const viewingFuture = dayOffset > 0;
  const dayLabel =
    dayOffset === 0
      ? 'Today'
      : dayOffset === -1
        ? 'Yesterday'
        : dayOffset === 1
          ? 'Tomorrow'
          : formatDayLabel(activeDay);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<'menu' | 'edit' | 'repeat' | 'tick' | 'picker' | 'action' | null>(null);
  const [menuLine, setMenuLine] = useState<TodayLine | null>(null);
  const [editLine, setEditLine] = useState<TodayLine | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [repeatLine, setRepeatLine] = useState<TodayLine | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const [heldSheet, setHeldSheet] = useState<'menu' | 'edit' | 'repeat' | 'tick' | 'picker' | 'action' | null>(null);
  if (sheet && sheet !== heldSheet) setHeldSheet(sheet);
  const shown = sheet ?? heldSheet;
  const [repeatChoice, setRepeatChoice] = useState<'every' | 'weekdays' | 'custom'>('every');
  const [customDays, setCustomDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [tickLine, setTickLine] = useState<TodayLine | null>(null);
  const [taskSearch, setTaskSearch] = useState('');
  const [actionLine, setActionLine] = useState<TodayLine | null>(null);

  const todayQuery = useTodayList(today);
  const pastQuery = useYesterdayList(viewingPast ? activeDay : '');
  const futureQuery = useTomorrowPlan(viewingFuture ? activeDay : '');
  const suggestionDay = viewingFuture ? activeDay : today;
  const suggestionsQuery = useTodaySuggestions(suggestionDay, !viewingPast);
  const { data: spaces = [] } = useSpaces();
  const activeQuery = viewingPast ? pastQuery : viewingFuture ? futureQuery : todayQuery;
  const lines = activeQuery.data ?? EMPTY_TODAY_LINES;
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
  const skipRoutine = useSkipTodayRoutine();
  const dismissSuggestion = useDismissTodaySuggestion(suggestionDay);
  const convertLine = useConvertTodayItem();
  const pickerOpen = sheet === 'picker';
  const taskChoices = useOpenTaskChoices(taskSearch, pickerOpen);
  const chime = useMomentumChime();

  const takenTaskIds = new Set(lines.flatMap((line) => (line.taskId ? [line.taskId] : [])));
  const choices = (taskChoices.data ?? []).filter((choice) => !takenTaskIds.has(choice.id));
  const suggestions = viewingPast ? [] : (suggestionsQuery.data ?? []);
  const writableCircles = spaces.filter((space) => canWrite(space.role));
  const doneCount = useMemo(
    () => lines.filter((line) => line.checkedAt !== null).length,
    [lines],
  );
  const stepDay = useCallback((delta: number) => {
    setDayOffset((current) => {
      const next = Math.min(MAX_FUTURE, Math.max(-MAX_PAST, current + delta));
      if (next !== current) hapticLight();
      return next;
    });
  }, []);
  const goToToday = useCallback(() => {
    setDayOffset((current) => {
      if (current !== 0) hapticLight();
      return 0;
    });
  }, []);
  const headerPan = useMemo(() => dayPanGesture(stepDay), [stepDay]);
  const listPan = useMemo(() => dayPanGesture(stepDay), [stepDay]);

  function openDrawer() {
    (navigation as unknown as { openDrawer: () => void }).openDrawer();
  }

  function onDraftChange(value: string) {
    if (value.includes('@')) {
      setDraft(value.replaceAll('@', ''));
      setSheet('picker');
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
    setSheet(null);
    setTaskSearch('');
    hapticMedium();
    addTask.mutate(
      {
        taskId: choice.id,
        title: choice.title,
        spaceName: choice.spaceName,
        spaceColor: choice.spaceColor,
      },
      { onError: (error) => quietError('Couldn’t add that action', error) },
    );
  }

  function countAfter(line: TodayLine, checked: boolean): number {
    const checkedAt = checked ? new Date().toISOString() : null;
    return momentumCount(withLinePatch(lines, line.id, { checkedAt }), today);
  }

  function onToggle(line: TodayLine) {
    if (viewingFuture) return;
    if (line.checkedAt) {
      hapticLight();
      if (viewingToday) chime.setStep(countAfter(line, false));
      check.mutate(
        { id: line.id, checked: false },
        {
          onError: (error) => {
            if (viewingToday) chime.setStep(momentumCount(lines, today));
            quietError('Couldn’t update that line', error);
          },
        },
      );
      return;
    }
    if (line.taskId) {
      hapticLight();
      setTickLine(line);
      setSheet('tick');
      return;
    }
    if (viewingToday) {
      chime.play(countAfter(line, true));
    }
    hapticSuccess();
    check.mutate(
      { id: line.id, checked: true },
      {
        onError: (error) => {
          if (viewingToday) chime.setStep(momentumCount(lines, today));
          quietError('Couldn’t update that line', error);
        },
      },
    );
  }

  function chooseTick(mode: 'today' | 'done') {
    const line = tickLine;
    const taskId = line?.taskId;
    if (!line || !taskId) return;
    closeSheet();
    const taskStatus = mode === 'done' ? 'done' : 'in_progress';
    if (viewingToday) {
      chime.play(countAfter(line, true));
    }
    hapticSuccess();
    // Completing an action is a win — plain lines (no taskId) never reach here.
    celebrate();
    check.mutate(
      { id: line.id, checked: true, taskId, taskStatus },
      {
        onError: (error) => {
          if (viewingToday) chime.setStep(momentumCount(lines, today));
          quietError('Couldn’t update that action', error);
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
    const scope = scopeForOffset(dayOffset);
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
    setRepeatLine(line);
    setSheet('repeat');
  }

  function closeSheet(then?: () => void) {
    afterClose.current = then ?? null;
    setSheet(null);
  }

  function openEditor(line: TodayLine) {
    if (line.taskId) {
      const href = `/task/${line.taskId}` as never;
      if (sheet) {
        closeSheet(() => router.push(href));
        return;
      }
      router.push(href);
      return;
    }
    setEditDraft(line.text ?? '');
    setEditLine(line);
    setSheet('edit');
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
    closeSheet();
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, days })
        : setRepeat.mutateAsync({ id: line.id, days });
    void pending.catch((error) => quietError('Couldn’t save that repeat', error));
  }

  async function deleteRoutine(line: TodayLine) {
    if (!line.routineId || !line.routineActive) return;
    closeSheet();
    const ok = await confirmDialog({
      title: 'Delete this routine?',
      message: 'It leaves this day and will not come back on later days.',
      confirmLabel: 'Delete routine',
      destructive: true,
    });
    if (!ok) return;
    const routineId = line.routineId;
    try {
      await updateRoutine.mutateAsync({ id: routineId, active: false });
      if (!line.virtual) await dismiss.mutateAsync(line.id);
    } catch (error) {
      quietError('Couldn’t delete that routine', error);
    }
  }

  function saveEdit() {
    if (!editLine) return;
    const text = editDraft.replace(/\s+/g, ' ').trim();
    if (!text) return;
    const line = editLine;
    closeSheet();
    const pending =
      line.virtual && line.routineId
        ? updateRoutine.mutateAsync({ id: line.routineId, text })
        : rename.mutateAsync({ id: line.id, text });
    void pending.catch((error) => quietError('Couldn’t save that line', error));
  }

  function removeFromDay(line: TodayLine) {
    closeSheet();
    if (line.checkedAt) return;
    const label = line.day === today ? 'Off today' : 'Off that day';
    if (line.virtual && line.routineId) {
      const routineId = line.routineId;
      skipRoutine.mutate(
        { routineId, day: line.day },
        {
          onSuccess: (id) => {
            if (!id) return;
            showUndoToast(label, () => {
              restore.mutate(
                { ...line, id, virtual: undefined },
                { onError: (error) => quietError('Couldn’t undo that', error) },
              );
            });
          },
          onError: (error) => quietError('Couldn’t take that off the day', error),
        },
      );
      return;
    }
    if (line.routineId) {
      dismiss.mutate(line.id, {
        onSuccess: () => {
          showUndoToast(label, () => {
            restore.mutate(line, { onError: (error) => quietError('Couldn’t undo that', error) });
          });
        },
        onError: (error) => quietError('Couldn’t take that off the day', error),
      });
      return;
    }
    void confirmDialog({
      title: 'Delete this line?',
      confirmLabel: 'Delete',
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      void remove.mutateAsync(line.id).catch((error) => quietError('Couldn’t delete that line', error));
    });
  }

  function routineAlreadyToday(line: TodayLine): boolean {
    if (!line.routineId) return false;
    return (todayQuery.data ?? []).some((item) => item.routineId === line.routineId);
  }

  function moveLine(line: TodayLine) {
    closeSheet();
    const pending = viewingFuture
      ? line.virtual && line.routineId
        ? placeRoutine.mutateAsync(line.routineId)
        : moveDay.mutateAsync({ id: line.id, day: today })
      : moveDay.mutateAsync({ id: line.id, day: viewingPast ? today : tomorrow });
    void pending.catch((error) => quietError('Couldn’t move that line', error));
  }

  function planLine(line: TodayLine, action: 'tomorrow' | 'not-today') {
    closeSheet();
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
        showUndoToast(viewingPast ? 'Dropped' : 'Off today', () => {
          restore.mutate(line, { onError: (error) => quietError('Couldn’t undo that', error) });
        });
      },
      onError: (error) => quietError('Couldn’t take that off today', error),
    });
  }

  function openMakeAction(line: TodayLine) {
    if (!canMakeTodayAction(line)) return;
    setActionLine(line);
    hapticLight();
    setSheet('action');
  }

  function chooseCircle(space: { id: string; name: string; color: string }) {
    const line = actionLine;
    if (!line) return;
    const title = (line.text ?? '').replace(/\s+/g, ' ').trim();
    closeSheet();
    convertLine.mutate(
      { id: line.id, spaceId: space.id, spaceName: space.name, spaceColor: space.color, title },
      { onError: (error) => quietError('Couldn’t make that an action', error) },
    );
  }

  function addSuggestion(item: TodaySuggestion) {
    hapticMedium();
    addTask.mutate(
      {
        taskId: item.taskId,
        title: item.title,
        spaceName: item.spaceName,
        spaceColor: item.spaceColor,
      },
      { onError: (error) => quietError('Couldn’t add that action', error) },
    );
  }

  function hideSuggestion(item: TodaySuggestion) {
    hapticLight();
    dismissSuggestion.mutate(item.taskId, {
      onError: (error) => quietError('Couldn’t dismiss that', error),
    });
  }

  function bringToToday(line: TodayLine) {
    closeSheet();
    hapticMedium();
    moveDay.mutate(
      { id: line.id, day: today },
      { onError: (error) => quietError('Couldn’t move that line', error) },
    );
  }

  function renderLine(line: TodayLine, drag: (() => void) | undefined, isActive: boolean | undefined, index: number) {
    const title = todayLineTitle(line);
    const checked = line.checkedAt !== null;
    const shiftable = viewingToday && canRescheduleTodayLine(line);
    const canBringToday = viewingPast && canRescheduleTodayLine(line);
    return (
      <TodayLineRow
        line={line}
        index={index}
        title={title}
        checked={checked}
        shiftable={shiftable}
        canBringToday={canBringToday}
        daySwipe={listPan}
        showHoverMenu={isWide && Platform.OS === 'web'}
        isActive={isActive}
        drag={drag}
        onToggle={() => onToggle(line)}
        onOpen={() => openEditor(line)}
        onEdit={() => openEditor(line)}
        onRemove={() => removeFromDay(line)}
        focused={focusedId === line.id}
        onFocusLine={() => setFocusedId(line.id)}
        onOpenMenu={() => {
          hapticLight();
          setMenuLine(line);
          setSheet('menu');
        }}
        onTomorrow={() => planLine(line, 'tomorrow')}
        onNotToday={() => planLine(line, 'not-today')}
        onBringToday={() => bringToToday(line)}
        onMakeAction={() => openMakeAction(line)}
        planningTomorrow={viewingFuture}
      />
    );
  }

  const empty = (
    <EmptyState
      icon={activeQuery.isError ? 'cloud-offline-outline' : 'sunny-outline'}
      title={
        activeQuery.isError
          ? `Couldn’t load ${viewingToday ? 'today' : 'that day'}`
          : viewingFuture
            ? 'Nothing planned'
            : viewingPast
              ? 'Nothing on that day'
              : 'A clear day'
      }
      body={
        activeQuery.isError
          ? 'Pull to refresh and try again.'
          : viewingFuture
            ? 'Write a line for that day. Routines that fall on it show here too.'
            : viewingPast
              ? 'Lines you wrote that day show here. Tick one, or move it to today.'
              : 'Write a line at the bottom. Type @ to pull in an action.'
      }
    />
  );

  const refresh = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void Promise.all([
          activeQuery.refetch(),
          viewingPast ? Promise.resolve() : suggestionsQuery.refetch(),
        ]).finally(() => setRefreshing(false));
      }}
      tintColor={colors.brand}
    />
  );

  const removeFromDayRef = useRef(removeFromDay);
  useEffect(() => {
    removeFromDayRef.current = removeFromDay;
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const line = lines.find((item) => item.id === focusedId);
      if (!line || line.checkedAt) return;
      event.preventDefault();
      removeFromDayRef.current(line);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusedId, lines]);

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
        <GestureDetector gesture={headerPan} touchAction="pan-y">
          <View>
            <DayHeader
              label={dayLabel}
              isToday={viewingToday}
              canBack={dayOffset > -MAX_PAST}
              canForward={dayOffset < MAX_FUTURE}
              onBack={() => stepDay(-1)}
              onForward={() => stepDay(1)}
              onToday={goToToday}
              onMenu={openDrawer}
              onInsights={() => router.push('/insights' as never)}
              showMenu={!isWide}
              wide={isWide}
            />
            <DayProgress
              done={doneCount}
              total={lines.length}
              viewingFuture={viewingFuture}
              wide={isWide}
            />
          </View>
        </GestureDetector>
      </CollapsingScreenHeader>

      <GestureDetector gesture={listPan} touchAction="pan-y">
      <View style={styles.listFrame}>
        {activeQuery.data === undefined && !activeQuery.isError ? (
          <View style={[styles.center, listPad]}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : (
          <DraggableFlatList
            key={activeDay}
            data={lines}
            keyExtractor={(line) => line.id}
            renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<TodayLine>) =>
              renderLine(item, drag, isActive, getIndex?.() ?? 0)
            }
            activationDistance={8}
            onDragBegin={() => hapticLight()}
            onDragEnd={onDragEnd}
            onScrollOffsetChange={collapse.onScrollOffsetChange}
            ListFooterComponent={
              suggestions.length === 0 ? null : (
                <SuggestionsSection
                  items={suggestions}
                  dayLabel={viewingFuture ? 'tomorrow' : 'today'}
                  onAdd={addSuggestion}
                  onDismiss={hideSuggestion}
                />
              )
            }
            ListEmptyComponent={suggestions.length > 0 ? null : empty}
            contentContainerStyle={[
              lines.length === 0 && suggestions.length === 0 ? styles.emptyList : styles.listContent,
              listPad,
            ]}
            refreshControl={refresh}
            containerStyle={styles.listFrame}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>
      </GestureDetector>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
          <TextInput
            value={draft}
            onChangeText={onDraftChange}
            onSubmitEditing={() => void submitDraft()}
            placeholder={
              viewingFuture
                ? 'Add a line for that day'
                : viewingPast
                  ? 'Add a line for that day'
                  : 'Add a line, or @ an action'
            }
            placeholderTextColor={colors.inkFaint}
            returnKeyType="done"
            blurOnSubmit={false}
            style={styles.input}
            accessibilityLabel="Add a line"
          />
          <Pressable
            onPress={() => {
              hapticLight();
              setSheet('picker');
            }}
            accessibilityRole="button"
            accessibilityLabel="Add an action"
            style={styles.taskButton}
          >
            <Ionicons name="add" size={24} color={colors.inkSoft} />
          </Pressable>
        </View>

      <FadeSheet
        visible={sheet !== null}
        wide={isWide}
        scroll={sheet !== 'picker'}
        onClose={() => closeSheet()}
        onClosed={() => {
          const next = afterClose.current;
          afterClose.current = null;
          next?.();
        }}
      >
        <SheetBottom style={[styles.sheet, isWide && styles.sheetWide]}>
          <View style={styles.sheetHeader}>
            <Text variant="sectionHeading" numberOfLines={2} style={styles.sheetTitle}>
              {shown === 'edit'
                ? 'Edit line'
                : shown === 'repeat'
                  ? 'Repeat'
                  : shown === 'picker'
                    ? 'Add an action'
                    : shown === 'action'
                      ? 'Make it an action'
                      : shown === 'tick' && tickLine
                        ? todayLineTitle(tickLine)
                        : menuLine
                          ? todayLineTitle(menuLine)
                          : ''}
            </Text>
            <Pressable onPress={() => closeSheet()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.inkSoft} />
            </Pressable>
          </View>
          {shown === 'menu' ? (
            <>
              <SheetAction label="Edit" onPress={() => menuLine && openEditor(menuLine)} />
              {menuLine?.taskId ? (
                <SheetAction
                  label="Open action"
                  detail="Jump to this action in its circle."
                  onPress={() => {
                    const taskId = menuLine?.taskId;
                    if (!taskId) return;
                    closeSheet(() => router.push(`/task/${taskId}` as never));
                  }}
                />
              ) : null}
              <SheetAction
                label={menuLine?.routineActive ? `Repeat · ${repeatLabel(menuLine.repeatDays ?? EVERY_DAY)}` : 'Repeat'}
                detail="Bring it back automatically on the days you pick."
                onPress={() => {
                  if (menuLine) openRepeat(menuLine);
                }}
              />
              {menuLine && canMakeTodayAction(menuLine) ? (
                <SheetAction
                  label="Convert to action"
                  detail="Add it to a circle as an action. The line stays here."
                  onPress={() => menuLine && openMakeAction(menuLine)}
                />
              ) : null}
              {viewingToday && menuLine && canRescheduleTodayLine(menuLine) ? (
                <SheetAction
                  label="Send to tomorrow"
                  detail="Moves off today onto tomorrow."
                  onPress={() => menuLine && planLine(menuLine, 'tomorrow')}
                />
              ) : null}
              {viewingPast && menuLine && canRescheduleTodayLine(menuLine) ? (
                <SheetAction
                  label="Move to today"
                  detail="Brings it onto today."
                  onPress={() => menuLine && bringToToday(menuLine)}
                />
              ) : null}
              {viewingFuture && menuLine && !(menuLine.virtual && routineAlreadyToday(menuLine)) ? (
                <SheetAction
                  label="Move to today"
                  detail="Brings it onto today."
                  onPress={() => menuLine && void moveLine(menuLine)}
                />
              ) : null}
              {menuLine?.routineId && menuLine.routineActive ? (
                <SheetAction
                  label={viewingToday ? 'Remove from today' : 'Remove from that day'}
                  detail="It comes back on the next day it repeats."
                  onPress={() => menuLine && removeFromDay(menuLine)}
                />
              ) : viewingFuture ? (
                <SheetAction
                  label="Drop"
                  destructive
                  detail="Removes it from that day."
                  onPress={() => menuLine && removeFromDay(menuLine)}
                />
              ) : (
                <SheetAction
                  label="Drop"
                  detail={
                    menuLine?.taskId
                      ? viewingToday
                        ? 'Takes it off today. The action stays in its circle.'
                        : 'Takes it off that day. The action stays in its circle.'
                      : viewingToday
                        ? 'Takes it off today.'
                        : 'Takes it off that day.'
                  }
                  onPress={() => menuLine && planLine(menuLine, 'not-today')}
                />
              )}
              {menuLine?.routineActive ? (
                <SheetAction label="Delete routine" destructive onPress={() => menuLine && void deleteRoutine(menuLine)} />
              ) : null}
            </>
          ) : null}
          {shown === 'edit' ? (
            <>
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
              {editLine?.routineActive ? (
                <SheetAction
                  label="Delete routine"
                  destructive
                  onPress={() => editLine && void deleteRoutine(editLine)}
                />
              ) : null}
            </>
          ) : null}
          {shown === 'repeat' ? (
            <>
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
                <SheetAction label="Delete routine" destructive onPress={() => repeatLine && void deleteRoutine(repeatLine)} />
              ) : null}
            </>
          ) : null}
          {shown === 'tick' ? (
            <>
              <Text variant="meta" color={colors.inkSoft}>
                Ticking this also updates the action. Unticking later only clears the line.
              </Text>
              <SheetAction
                label="Done for today"
                detail="Keep the action in progress"
                quiet
                onPress={() => void chooseTick('today')}
              />
              <SheetAction label="Finished" detail="Mark the action done" quiet onPress={() => void chooseTick('done')} />
            </>
          ) : null}
          {shown === 'picker' ? (
            <>
              <TextInput
                value={taskSearch}
                onChangeText={setTaskSearch}
                placeholder="Search your open actions"
                placeholderTextColor={colors.inkFaint}
                style={styles.sheetInput}
                accessibilityLabel="Search actions"
              />
              {taskChoices.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
              {taskChoices.isError ? (
                <Text variant="meta" color={colors.priorityHigh}>
                  Couldn’t load actions. Try again.
                </Text>
              ) : null}
              <View style={styles.pickerListWrap}>
                <ScrollView
                  style={{ maxHeight: PICKER_LIST_MAX }}
                  contentContainerStyle={styles.taskChoices}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {choices.map((choice) => (
                    <Pressable
                      key={choice.id}
                      onPress={() => pickTask(choice)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${choice.title}`}
                      style={styles.taskChoice}
                    >
                      <Text variant="bodyMedium" color={colors.ink}>
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
                      No open actions match.
                    </Text>
                  ) : null}
                </ScrollView>
                <View pointerEvents="none" style={styles.pickerListFade}>
                  {Array.from({ length: 8 }).map((_, i) => (
                    <View
                      key={i}
                      style={{ flex: 1, backgroundColor: colors.surface, opacity: 1 - i / 8 }}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : null}
          {shown === 'action' ? (
            <>
              <Text variant="meta" color={colors.inkSoft}>
                It stays on this line, in the same place.
              </Text>
              {writableCircles.map((space) => (
                <Pressable
                  key={space.id}
                  onPress={() => chooseCircle(space)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add to ${space.name}`}
                  style={styles.choice}
                >
                  <AccentDot color={resolveAccent(space.color)} size={8} />
                  <Text variant="bodyMedium" style={styles.choiceTitle} numberOfLines={1}>
                    {space.name}
                  </Text>
                </Pressable>
              ))}
              {writableCircles.length === 0 ? (
                <Text variant="meta" color={colors.inkSoft}>
                  You need a circle you can add to.
                </Text>
              ) : null}
            </>
          ) : null}
        </SheetBottom>
      </FadeSheet>
    </KeyboardAvoidingView>
  );
}

/** The date title, re-animated letter-by-letter whenever the day changes. */
function DateLabel({ label, color }: { label: string; color: string }) {
  const chars = useMemo(() => label.split(''), [label]);
  return (
    <View
      style={styles.dateLabelRow}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {chars.map((ch, i) => (
        <Animated.Text
          key={`${label}-${i}`}
          entering={FadeInDown.delay(i * 14).duration(240)}
          style={[typeScale.sectionHeading, { color }]}
        >
          {ch === ' ' ? ' ' : ch}
        </Animated.Text>
      ))}
    </View>
  );
}

/**
 * One-line header: menu · date · balance. Small chevrons flank the date, which
 * is the title; tapping it returns to today. Tinted green when off today.
 */
function DayHeader({
  label,
  isToday,
  canBack,
  canForward,
  onBack,
  onForward,
  onToday,
  onMenu,
  onInsights,
  showMenu,
  wide,
}: {
  label: string;
  isToday: boolean;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onToday: () => void;
  onMenu: () => void;
  onInsights: () => void;
  showMenu: boolean;
  wide: boolean;
}) {
  return (
    <View style={[styles.header, wide && styles.headerWide]}>
      <View style={styles.headerSide}>
        {showMenu ? (
          <Pressable
            onPress={onMenu}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open circles"
            style={styles.iconButton}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.dayTitle}>
        <Pressable
          onPress={onBack}
          disabled={!canBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          accessibilityState={{ disabled: !canBack }}
          style={[styles.dayChevron, !canBack && styles.dayChevronOff]}
        >
          <Ionicons name="chevron-back" size={20} color={colors.inkSoft} />
        </Pressable>
        <Pressable
          onPress={onToday}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isToday ? label : `${label}. Return to today`}
          style={styles.dayTitleLabel}
        >
          <DateLabel label={label} color={isToday ? colors.ink : colors.brandDeep} />
        </Pressable>
        <Pressable
          onPress={onForward}
          disabled={!canForward}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: !canForward }}
          style={[styles.dayChevron, !canForward && styles.dayChevronOff]}
        >
          <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <View style={styles.headerSideRight}>
        <Pressable
          onPress={onInsights}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Insights"
          style={styles.iconButton}
        >
          <Ionicons name="stats-chart-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

/** Thin momentum line under the header: how much of the day is done. */
function DayProgress({
  done,
  total,
  viewingFuture,
  wide,
}: {
  done: number;
  total: number;
  viewingFuture: boolean;
  wide: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const target = total > 0 && !viewingFuture ? done / total : 0;
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(target * trackWidth, { duration: 340 });
  }, [target, trackWidth, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: fill.value }));

  const label =
    total === 0 ? '' : viewingFuture ? `${total} planned` : `${done} of ${total} done`;

  return (
    <View style={[styles.progress, wide && styles.progressWide]}>
      <View
        style={styles.progressTrack}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </View>
      {label ? (
        <Text variant="meta" color={colors.inkFaint} numberOfLines={1} style={styles.progressLabel}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

function TodayLineRow({
  line,
  index,
  title,
  checked,
  shiftable,
  canBringToday,
  daySwipe,
  showHoverMenu,
  isActive,
  drag,
  planningTomorrow,
  onToggle,
  onOpen,
  onEdit,
  onRemove,
  onOpenMenu,
  onTomorrow,
  onNotToday,
  onBringToday,
  onMakeAction,
  focused,
  onFocusLine,
}: {
  line: TodayLine;
  index: number;
  title: string;
  checked: boolean;
  shiftable: boolean;
  canBringToday: boolean;
  daySwipe: GestureType;
  showHoverMenu: boolean;
  isActive?: boolean;
  drag?: () => void;
  planningTomorrow: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onOpenMenu: () => void;
  onTomorrow: () => void;
  onNotToday: () => void;
  onBringToday: () => void;
  onMakeAction: () => void;
  focused?: boolean;
  onFocusLine: () => void;
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
      style={[styles.row, isActive && styles.rowActive, focused && styles.rowFocused]}
      {...(showHoverMenu
        ? {
            onPointerEnter: () => setHovered(true),
            onPointerLeave: () => setHovered(false),
          }
        : null)}
      {...contextMenu}
      {...(Platform.OS === 'web'
        ? { tabIndex: 0 as const, onFocus: onFocusLine }
        : null)}
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
      {canMakeTodayAction(line) && !(showHoverMenu && hovered) ? (
        <Pressable
          onPress={onMakeAction}
          accessibilityRole="button"
          accessibilityLabel={`Make ${title} an action`}
          hitSlop={6}
          style={styles.makeAction}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.inkFaint} />
        </Pressable>
      ) : null}
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
      {canBringToday ? (
        <Pressable
          onPress={onBringToday}
          accessibilityRole="button"
          accessibilityLabel={`Move ${title} to today`}
          hitSlop={6}
          style={styles.bringToday}
        >
          <Text variant="meta" color={colors.inkSoft}>
            Today
          </Text>
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

  const routineSkip = !checked && line.routineId !== null && !shiftable;

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 24).duration(260)}>
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      leftThreshold={36}
      rightThreshold={36}
      dragOffsetFromLeftEdge={20}
      dragOffsetFromRightEdge={20}
      blocksExternalGesture={daySwipe}
      overshootRight={false}
      overshootLeft={false}
      onSwipeableWillOpen={() => hapticLight()}
      renderLeftActions={() => (
        <View style={styles.swipeActions}>
          <Pressable
            onPress={() => {
              ref.current?.close();
              hapticLight();
              onEdit();
            }}
            accessibilityRole="button"
            accessibilityLabel="Edit"
            style={[styles.swipeAction, styles.swipeTomorrow]}
          >
            <Text variant="meta" color={colors.brandDeep}>
              Edit
            </Text>
          </Pressable>
        </View>
      )}
      renderRightActions={
        shiftable
          ? () => (
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
            accessibilityLabel="Drop"
            style={[styles.swipeAction, styles.swipeNotToday]}
          >
            <Text variant="meta" color={colors.ink}>
              Drop
            </Text>
          </Pressable>
        </View>
      )
          : canBringToday
            ? () => (
                <View style={styles.swipeActions}>
                  <Pressable
                    onPress={() => {
                      ref.current?.close();
                      hapticLight();
                      onBringToday();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Move to today"
                    style={[styles.swipeAction, styles.swipeTomorrow]}
                  >
                    <Text variant="meta" color={colors.brandDeep}>
                      Today
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      ref.current?.close();
                      hapticLight();
                      onNotToday();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Drop"
                    style={[styles.swipeAction, styles.swipeNotToday]}
                  >
                    <Text variant="meta" color={colors.ink}>
                      Drop
                    </Text>
                  </Pressable>
                </View>
              )
          : routineSkip
            ? () => (
                <View style={styles.swipeActions}>
                  <Pressable
                    onPress={() => {
                      ref.current?.close();
                      hapticLight();
                      onRemove();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove from this day"
                    style={[styles.swipeAction, styles.swipeNotToday]}
                  >
                    <Text variant="meta" color={colors.ink}>
                      Remove
                    </Text>
                  </Pressable>
                </View>
              )
            : undefined
      }
    >
      {row}
    </ReanimatedSwipeable>
    </Animated.View>
  );
}

function SuggestionsSection({
  items,
  dayLabel,
  onAdd,
  onDismiss,
}: {
  items: readonly TodaySuggestion[];
  dayLabel: string;
  onAdd: (item: TodaySuggestion) => void;
  onDismiss: (item: TodaySuggestion) => void;
}) {
  return (
    <View style={styles.suggestionSection}>
      <Text
        variant="label"
        color={colors.inkFaint}
        style={styles.suggestionLabel}
        accessibilityRole="header"
      >
        Suggested from Mine
      </Text>
      {items.map((item) => (
        <View key={item.taskId} style={styles.row}>
          <View style={styles.checkbox} />
          <View style={styles.rowBody}>
            <Text variant="body" color={colors.inkSoft} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.circleBadge}>
              <AccentDot color={resolveAccent(item.spaceColor)} size={8} />
              <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                {item.spaceName}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => onAdd(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.title} to ${dayLabel}`}
            hitSlop={6}
            style={styles.suggestionAdd}
          >
            <Ionicons name="add" size={22} color={colors.inkSoft} />
          </Pressable>
          <Pressable
            onPress={() => onDismiss(item)}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${item.title}`}
            hitSlop={6}
            style={styles.suggestionDismiss}
          >
            <Ionicons name="close" size={18} color={colors.inkFaint} />
          </Pressable>
        </View>
      ))}
    </View>
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
  headerSide: { minWidth: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerSideRight: { minWidth: 40, alignItems: 'flex-end', justifyContent: 'center' },
  dayTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dayChevron: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  dayChevronOff: { opacity: 0.3 },
  dayTitleLabel: {
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center' },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  progressWide: { paddingHorizontal: spacing.xl },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  progressFill: { height: 4, borderRadius: 4, backgroundColor: colors.brand },
  progressLabel: { textAlign: 'right' },
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
  rowFocused: { backgroundColor: colors.surfaceAlt },
  suggestionSection: {
    marginTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  suggestionLabel: {
    marginLeft: spacing.sm + 44,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  suggestionAdd: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionDismiss: {
    width: 36,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bringToday: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  makeAction: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
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
    paddingHorizontal: spacing.xl,
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
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
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
  taskChoices: { gap: spacing.sm, flexGrow: 0, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  pickerListWrap: { position: 'relative' },
  pickerListFade: { position: 'absolute', top: 0, left: 0, right: 0, height: 12 },
  taskChoice: {
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  dayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dayChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  dayChipOn: { backgroundColor: colors.brandSoft },
});
