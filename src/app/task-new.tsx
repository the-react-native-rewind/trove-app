import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SpacePicker } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { pickMedia, uploadTaskMedia, type PickedMedia } from '@/data/attachments';
import { useSpaces } from '@/data/spaces';
import { useCreateTask } from '@/data/tasks';
import { useDictation } from '@/hooks/useDictation';
import { fallbackTitle, inferDueDate } from '@/lib/capture';
import { enrichCapture } from '@/lib/enrich';
import { formatDueDate } from '@/lib/format';
import { canWrite } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, radii, spacing, type as typeScale } from '@/theme/tokens';

/**
 * Capture sheet: one box, a mic, a space. Title, polished description, and
 * due date are inferred (chrono locally for the date, AI for the rest).
 * Status is always "To do"; assignee and priority live on the edit screen.
 */
export default function NewTask() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spaceId?: string }>();
  const { data: spaces = [] } = useSpaces();
  const { userId } = useAuth();
  const { selectedSpaceId } = useSelectedSpace();
  const createTask = useCreateTask();

  const writableSpaces = spaces.filter((s) => canWrite(s.role));
  const preferredSpace = params.spaceId ?? selectedSpaceId;
  const initialSpace = writableSpaces.some((s) => s.id === preferredSpace)
    ? preferredSpace
    : writableSpaces[0]?.id ?? null;

  const [text, setText] = useState('');
  const [spaceId, setSpaceId] = useState<string | null>(initialSpace);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [dismissedMatch, setDismissedMatch] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function addMedia() {
    const picked = await pickMedia();
    if (picked) setMedia((prev) => [...prev, picked]);
  }

  async function onCreate() {
    setError(null);
    const rawText = text.trim();
    if (!rawText) {
      setError('Write what needs doing, in your own words.');
      return;
    }
    if (!spaceId) {
      setError('Choose a space for this task.');
      return;
    }
    if (dictation.listening) dictation.stop();
    setSaving(true);
    try {
      const enriched = await enrichCapture({ rawText, inferredDueDate: dueDate });
      const title = enriched?.title?.trim() || fallbackTitle(rawText);
      const description = enriched ? enriched.description : rawText;
      // A dismissed chip means "no date", whatever the model thinks.
      const due = dismissedMatch && !dueDate ? null : (enriched?.due_date ?? dueDate);

      const task = await createTask.mutateAsync({
        space_id: spaceId,
        title,
        description,
        status: 'todo',
        assignee_id: null,
        priority: null,
        due_date: due,
      });
      for (const m of media) {
        try {
          await uploadTaskMedia({
            taskId: task.id,
            spaceId,
            uri: m.uri,
            mediaType: m.mediaType,
            userId,
          });
        } catch {
          // A failed attachment shouldn't lose the created task.
        }
      }
      router.back();
    } catch {
      setError('We could not add that task. Try again.');
      setSaving(false);
    }
  }

  if (writableSpaces.length === 0) {
    return (
      <ModalScaffold title="New task">
        <Text variant="body" color={colors.inkSoft}>
          You need a space you can add to first. Create one from the spaces menu.
        </Text>
      </ModalScaffold>
    );
  }

  return (
    <ModalScaffold
      title="New task"
      footer={<Button label={saving ? 'Polishing…' : 'Add task'} onPress={onCreate} loading={saving} />}
    >
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
            <Text variant="meta" color={colors.priorityHigh}>
              Listening…
            </Text>
          ) : (
            <Text variant="meta" color={colors.inkFaint}>
              A title and due date are worked out for you.
            </Text>
          )}
          {dictation.available ? (
            <Pressable
              onPress={toggleDictation}
              accessibilityRole="button"
              accessibilityLabel={dictation.listening ? 'Stop dictating' : 'Dictate the task'}
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

      <SpacePicker spaces={spaces} value={spaceId} onChange={setSpaceId} />

      <View style={styles.mediaField}>
        <Text variant="label" color={colors.inkSoft}>
          Media
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

      {error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {error}
        </Text>
      ) : null}
    </ModalScaffold>
  );
}

const TILE = 88;
const styles = StyleSheet.create({
  captureBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  captureInput: {
    minHeight: 120,
    textAlignVertical: 'top',
    color: colors.ink,
    ...typeScale.body,
    fontSize: 17,
    lineHeight: 24,
  },
  captureFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonActive: { backgroundColor: colors.priorityHigh },
  dueChipRow: { flexDirection: 'row', marginTop: -spacing.md },
  dueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.brandSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  mediaField: { gap: spacing.sm },
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
