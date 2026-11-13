import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Toast from 'react-native-toast-message';

import { AssigneePicker, SpacePicker } from '@/components/form';
import { PrioritySlider } from '@/components/PrioritySlider';
import { Button } from '@/components/ui/Button';
import { FadeSheet, SheetBottom } from '@/components/ui/FadeSheet';
import { Text } from '@/components/ui/Text';
import { pickMedia, uploadTaskMedia, type PickedMedia } from '@/data/attachments';
import { useAcceptInboxItem } from '@/data/inbox';
import { useSpaces } from '@/data/spaces';
import { useCreateTask, useTasks } from '@/data/tasks';
import { useIsWide } from '@/hooks/useIsWide';
import { useDictation } from '@/hooks/useDictation';
import { fallbackTitle, inferDueDate } from '@/lib/capture';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { enrichCapture } from '@/lib/enrich';
import { formatDueDate } from '@/lib/format';
import { DEFAULT_IMPORTANCE, ranksForPlacement } from '@/lib/importance';
import { rankForImportance } from '@/lib/rank';
import { supabase } from '@/lib/supabase';
import { localToday, parseDay } from '@/lib/today';
import { canWrite } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, radii, shadows, spacing, type as typeScale } from '@/theme/tokens';

/**
 * New action: a guided multi-step bottom sheet. One thing per step so adding an
 * action feels like being walked through it, not filling in a wall of fields.
 *   1. What needs doing (text + mic; title, description and due date inferred)
 *   2. Importance (where it sits among the circle's actions)
 *   3. Circle
 *   4. Who it's for
 *   5. Media (optional)
 * Status is always "To do". It starts assigned to you, so it shows on My Actions.
 * Opened prefilled (text + inboxId) when accepting an inbox line, and with
 * addToDay from the planner so the new action also lands on that day.
 */
const STEP_COUNT = 5;
const STEP_WHAT = 0;
const STEP_IMPORTANCE = 1;
const STEP_CIRCLE = 2;
const STEP_WHO = 3;
const STEP_MEDIA = 4;

export default function NewTask() {
  const router = useRouter();
  const isWide = useIsWide();
  const params = useLocalSearchParams<{
    spaceId?: string;
    projectId?: string;
    text?: string;
    inboxId?: string;
    /** Set when opened from the planner: the new action is also put on this day. */
    addToDay?: string;
  }>();
  const { data: spaces = [] } = useSpaces();
  const { userId } = useAuth();
  const { selectedSpaceId } = useSelectedSpace();
  const createTask = useCreateTask();
  const acceptInbox = useAcceptInboxItem();
  const queryClient = useQueryClient();

  const writableSpaces = spaces.filter((s) => canWrite(s.role));
  const preferredSpace = params.spaceId ?? selectedSpaceId;
  const initialSpace = writableSpaces.some((s) => s.id === preferredSpace)
    ? preferredSpace
    : writableSpaces[0]?.id ?? null;

  const [open, setOpen] = useState(true);
  const [stepIndex, setStepIndex] = useState(STEP_WHAT);
  // Accepting an inbox line opens this sheet prefilled with the captured text.
  const [text, setText] = useState(params.text ?? '');
  const [spaceId, setSpaceId] = useState<string | null>(initialSpace);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(userId ? [userId] : []);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [importance, setImportance] = useState(DEFAULT_IMPORTANCE);
  const [dismissedMatch, setDismissedMatch] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const circleTasks = useTasks(spaceId ?? '');
  const placementProjectId = spaceId === params.spaceId ? (params.projectId ?? null) : null;
  const peerRanks = useMemo(
    () => ranksForPlacement(circleTasks.data ?? [], placementProjectId),
    [circleTasks.data, placementProjectId],
  );

  const isLast = stepIndex === STEP_MEDIA;

  // Text present before the current dictation session started.
  const dictationBaseRef = useRef('');
  const dictation = useDictation((sessionTranscript) => {
    const base = dictationBaseRef.current;
    const joiner = base && !base.endsWith(' ') ? ' ' : '';
    setText(base + joiner + sessionTranscript);
  });

  function toggleDictation() {
    if (dictation.listening) {
      dictation.stop();
    } else {
      dictationBaseRef.current = text;
      dictation.start();
    }
  }

  const inferred = inferDueDate(text);
  const dueDate = inferred && inferred.matchedText !== dismissedMatch ? inferred.date : null;

  function close() {
    if (dictation.listening) dictation.stop();
    setOpen(false);
  }

  async function addMedia() {
    const picked = await pickMedia();
    if (picked) setMedia((prev) => [...prev, picked]);
  }

  /** Step 0 needs a line before the rest make sense; the circle has a default. */
  function goTo(target: number) {
    if (target > STEP_WHAT && !text.trim()) {
      setStepIndex(STEP_WHAT);
      setError('Write what needs doing first.');
      return;
    }
    setError(null);
    if (dictation.listening) dictation.stop();
    setStepIndex(Math.max(0, Math.min(STEP_COUNT - 1, target)));
  }

  async function onCreate() {
    setError(null);
    const rawText = text.trim();
    if (!rawText) {
      setStepIndex(STEP_WHAT);
      setError('Write what needs doing, in your own words.');
      return;
    }
    if (!spaceId) {
      setStepIndex(STEP_CIRCLE);
      setError('Choose a circle for this action.');
      return;
    }
    hapticMedium();
    if (dictation.listening) dictation.stop();
    setSaving(true);
    try {
      const enriched = await enrichCapture({ rawText, inferredDueDate: dueDate });
      const title = enriched?.title?.trim() || fallbackTitle(rawText);
      const description = enriched ? enriched.description : rawText;
      // A dismissed chip means "no date", whatever the model thinks.
      const due = dismissedMatch && !dueDate ? null : (enriched?.due_date ?? dueDate);

      const projectId = spaceId === params.spaceId ? (params.projectId ?? null) : null;
      const task = await createTask.mutateAsync({
        space_id: spaceId,
        title,
        description,
        status: 'todo',
        priority: null,
        due_date: due,
        assignee_ids: assigneeIds,
        project_id: projectId,
        // Loaded peers put the action in the gap the slider is pointing at.
        // Until then the database still appends it, which matches the default.
        rank: circleTasks.isSuccess ? rankForImportance(peerRanks, importance) : undefined,
      });
      for (const m of media) {
        try {
          await uploadTaskMedia({
            taskId: task.id,
            spaceId,
            uri: m.uri,
            mediaType: m.mediaType,
            width: m.width,
            height: m.height,
            userId,
          });
        } catch {
          // A failed attachment shouldn't lose the created action.
        }
      }
      // Accepted from the inbox: link the line to its action and take it off
      // the inbox. A failure here shouldn't lose the created action.
      if (params.inboxId) {
        try {
          await acceptInbox.mutateAsync({ id: params.inboxId, taskId: task.id });
        } catch {
          // The action exists; the inbox line will be reconciled on next load.
        }
      }
      // Made from the planner: put it on the day that was showing. The action
      // is already saved, so a refusal here is reported, not thrown.
      const addToDay = params.addToDay ? parseDay(params.addToDay) : null;
      if (addToDay) {
        const { error: dayError } = await supabase.rpc('add_today_item', {
          p_day: addToDay,
          p_text: null,
          p_task_id: task.id,
          p_as_of: localToday(),
        });
        if (dayError) {
          Toast.show({
            type: 'error',
            text1: 'Action added',
            text2: 'It could not be put on that day. Add it from the planner.',
          });
        } else {
          for (const key of ['today', 'yesterday', 'tomorrow', 'today-task-links', 'today-suggestions']) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
        }
      }
      close();
    } catch {
      setError('We could not add that action. Try again.');
      setSaving(false);
    }
  }

  const noCircles = writableSpaces.length === 0;

  return (
    <FadeSheet
      visible={open}
      wide={isWide}
      scroll
      onClose={close}
      onClosed={() => {
        if (router.canGoBack()) router.back();
      }}
    >
      <SheetBottom style={[styles.sheet, isWide && styles.sheetWide]}>
        <View style={styles.grabber} />

        {noCircles ? (
          <Text variant="body" color={colors.inkSoft} style={styles.emptyCopy}>
            You need a circle you can add to first. Create one from the circles menu.
          </Text>
        ) : (
          <>
            <Stepper index={stepIndex} onJump={goTo} />

            {stepIndex === STEP_WHAT ? (
              <View style={styles.step}>
                <View style={styles.captureBox}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder="What needs doing?"
                    placeholderTextColor={colors.inkFaint}
                    multiline
                    autoFocus
                    style={styles.captureInput}
                  />
                  <View style={styles.captureFooter}>
                    {dictation.listening ? (
                      <Text variant="meta" color={colors.priorityHigh} style={styles.captureHint}>
                        Listening…
                      </Text>
                    ) : (
                      <Text variant="meta" color={colors.inkFaint} style={styles.captureHint}>
                        A title and due date are worked out for you.
                      </Text>
                    )}
                    {dictation.available ? (
                      <Pressable
                        onPress={() => {
                          hapticLight();
                          toggleDictation();
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={dictation.listening ? 'Stop dictating' : 'Dictate the action'}
                        style={[styles.micButton, dictation.listening && styles.micButtonActive]}
                      >
                        <Ionicons
                          name={dictation.listening ? 'stop' : 'mic-outline'}
                          size={20}
                          color={dictation.listening ? colors.onBrand : colors.brandDeep}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {dueDate ? (
                  <View style={styles.dueChipRow}>
                    <View style={styles.dueChip}>
                      <Ionicons name="calendar-outline" size={15} color={colors.brandDeep} />
                      <Text variant="meta" color={colors.brandDeep}>
                        Due {formatDueDate(dueDate)}
                      </Text>
                      <Pressable
                        onPress={() => setDismissedMatch(inferred?.matchedText ?? null)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Remove due date"
                      >
                        <Ionicons name="close" size={15} color={colors.brandDeep} />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            {stepIndex === STEP_IMPORTANCE ? (
              <View style={styles.step}>
                <Text variant="label" color={colors.inkSoft}>
                  How important is this?
                </Text>
                <Text variant="meta" color={colors.inkFaint}>
                  Sets where it sits among the circle’s actions. You can nudge it later.
                </Text>
                <PrioritySlider value={importance} onChange={setImportance} peerRanks={peerRanks} />
              </View>
            ) : null}

            {stepIndex === STEP_CIRCLE ? (
              <View style={styles.step}>
                <Text variant="label" color={colors.inkSoft}>
                  Which circle?
                </Text>
                <SpacePicker
                  spaces={spaces}
                  value={spaceId}
                  onChange={(next) => {
                    setSpaceId(next);
                    setAssigneeIds(userId ? [userId] : []);
                  }}
                />
              </View>
            ) : null}

            {stepIndex === STEP_WHO ? (
              <View style={styles.step}>
                <Text variant="label" color={colors.inkSoft}>
                  Who’s it for?
                </Text>
                <AssigneePicker spaceId={spaceId} value={assigneeIds} onChange={setAssigneeIds} />
              </View>
            ) : null}

            {stepIndex === STEP_MEDIA ? (
              <View style={styles.step}>
                <Text variant="label" color={colors.inkSoft}>
                  Add media
                </Text>
                <Text variant="meta" color={colors.inkFaint}>
                  Optional — a photo or video for context.
                </Text>
                <View style={styles.mediaGrid}>
                  {media.map((m, i) => (
                    <Pressable
                      key={`${m.uri}-${i}`}
                      onLongPress={() => setMedia((prev) => prev.filter((_, idx) => idx !== i))}
                      style={styles.mediaTile}
                    >
                      {m.mediaType === 'image' ? (
                        <Image source={{ uri: m.uri }} style={styles.mediaImg} contentFit="cover" />
                      ) : (
                        <View style={styles.videoTile}>
                          <Ionicons name="videocam" size={22} color={colors.brand} />
                        </View>
                      )}
                    </Pressable>
                  ))}
                  <Pressable
                    onPress={addMedia}
                    accessibilityRole="button"
                    accessibilityLabel="Add photo or video"
                    style={[styles.mediaTile, styles.addTile]}
                  >
                    <Ionicons name="add" size={24} color={colors.brand} />
                    <Text variant="meta" color={colors.brand}>
                      Add
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {error ? (
              <Text variant="meta" color={colors.priorityHigh}>
                {error}
              </Text>
            ) : null}

            <View style={styles.footerRow}>
              {stepIndex > STEP_WHAT ? (
                <Button
                  label="Back"
                  variant="secondary"
                  size="md"
                  fullWidth={false}
                  onPress={() => goTo(stepIndex - 1)}
                  style={styles.backBtn}
                />
              ) : null}
              <Button
                label={isLast ? (saving ? 'Polishing…' : 'Add action') : 'Next'}
                size="md"
                onPress={() => (isLast ? onCreate() : goTo(stepIndex + 1))}
                loading={isLast && saving}
                fullWidth={false}
                haptic={isLast ? 'none' : 'light'}
                style={styles.nextBtn}
              />
            </View>
          </>
        )}
      </SheetBottom>
    </FadeSheet>
  );
}

/** A quiet progress rail: a dot per step, the current one stretched. */
function Stepper({ index, onJump }: { index: number; onJump: (i: number) => void }) {
  return (
    <View style={styles.stepper}>
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <Pressable
          key={i}
          onPress={() => onJump(i)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Step ${i + 1} of ${STEP_COUNT}`}
          accessibilityState={{ selected: i === index }}
          style={[styles.dot, i === index && styles.dotActive, i < index && styles.dotDone]}
        />
      ))}
    </View>
  );
}

const TILE = 88;
const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  sheetWide: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: radii.lg,
    ...shadows.floating,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.hairline,
    marginBottom: spacing.xs,
  },
  emptyCopy: { paddingVertical: spacing.lg },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.hairline },
  dotActive: { width: 22, backgroundColor: colors.brand },
  dotDone: { backgroundColor: colors.brandDeep },
  step: { gap: spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
  captureBox: {
    alignSelf: 'stretch',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: spacing.sm,
  },
  captureInput: {
    width: '100%',
    minWidth: 0,
    minHeight: 96,
    textAlignVertical: 'top',
    color: colors.ink,
    ...typeScale.body,
    fontSize: 17,
    lineHeight: 24,
  },
  captureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  captureHint: { flex: 1, minWidth: 0 },
  micButton: {
    flexGrow: 0,
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: colors.priorityHigh },
  dueChipRow: { flexDirection: 'row' },
  dueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mediaTile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  mediaImg: { width: '100%', height: '100%' },
  videoTile: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 2, borderStyle: 'dashed' },
});
