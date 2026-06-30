import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AssigneePicker, DueDatePicker, FieldLabel, OptionChips, SpacePicker } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { pickMedia, uploadTaskMedia, type PickedMedia } from '@/data/attachments';
import { useSpaces } from '@/data/spaces';
import { useCreateTask } from '@/data/tasks';
import { useAuth } from '@/providers/AuthProvider';
import { canWrite, STATUSES, type Priority, type TaskStatus } from '@/lib/types';
import { colors, priority as priorityTokens, radii, spacing } from '@/theme/tokens';

const PRIORITY_OPTIONS: { value: Priority | 'none'; label: string; color?: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low', color: priorityTokens.low.color },
  { value: 'medium', label: 'Medium', color: priorityTokens.medium.color },
  { value: 'high', label: 'High', color: priorityTokens.high.color },
];

export default function NewTask() {
  const router = useRouter();
  const params = useLocalSearchParams<{ spaceId?: string; status?: string }>();
  const { data: spaces = [] } = useSpaces();
  const { userId } = useAuth();
  const createTask = useCreateTask();

  const writableSpaces = spaces.filter((s) => canWrite(s.role));
  const initialSpace =
    params.spaceId && writableSpaces.some((s) => s.id === params.spaceId)
      ? params.spaceId
      : writableSpaces[0]?.id ?? null;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [spaceId, setSpaceId] = useState<string | null>(initialSpace);
  const [status, setStatus] = useState<TaskStatus>((params.status as TaskStatus) || 'todo');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority | 'none'>('none');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function addMedia() {
    const picked = await pickMedia();
    if (picked) setMedia((prev) => [...prev, picked]);
  }

  async function onCreate() {
    setError(null);
    if (!title.trim()) {
      setError('What needs doing? Add a short title.');
      return;
    }
    if (!spaceId) {
      setError('Choose a space for this task.');
      return;
    }
    try {
      const task = await createTask.mutateAsync({
        space_id: spaceId,
        title,
        description,
        status,
        assignee_id: assigneeId,
        priority: priority === 'none' ? null : priority,
        due_date: dueDate,
      });
      // Upload any staged media now that the task exists.
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
      footer={<Button label="Add task" onPress={onCreate} loading={createTask.isPending} />}
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          placeholder="Water the tomatoes"
          autoFocus
          returnKeyType="next"
        />
        <TextField
          label="Notes"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional details"
          multiline
          numberOfLines={3}
          style={{ minHeight: 80, textAlignVertical: 'top' }}
        />
      </View>

      <SpacePicker spaces={spaces} value={spaceId} onChange={setSpaceId} />
      <OptionChips
        label="Status"
        options={STATUSES.map((s) => ({ value: s.key, label: s.label }))}
        value={status}
        onChange={setStatus}
      />
      <AssigneePicker spaceId={spaceId} value={assigneeId} onChange={setAssigneeId} />
      <OptionChips
        label="Priority"
        options={PRIORITY_OPTIONS}
        value={priority}
        onChange={setPriority}
      />
      <DueDatePicker value={dueDate} onChange={setDueDate} />

      <View style={styles.mediaField}>
        <FieldLabel>Media</FieldLabel>
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
