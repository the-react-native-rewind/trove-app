import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  type Attachment,
  pickMedia,
  useAddAttachment,
  useDeleteAttachment,
  useTaskAttachments,
} from '@/data/attachments';
import { colors, radii, spacing } from '@/theme/tokens';
import { FieldLabel } from './form';
import { Text } from './ui/Text';

export function TaskMedia({
  taskId,
  spaceId,
  canWrite,
}: {
  taskId: string;
  spaceId: string;
  canWrite: boolean;
}) {
  const { data: items = [] } = useTaskAttachments(taskId);
  const addAttachment = useAddAttachment(taskId, spaceId);
  const deleteAttachment = useDeleteAttachment(taskId);
  const [error, setError] = useState<string | null>(null);

  async function pick() {
    setError(null);
    const picked = await pickMedia();
    if (!picked) return;
    try {
      await addAttachment.mutateAsync(picked);
    } catch (e) {
      // Alert doesn't render on web, so surface the reason inline everywhere.
      const message = e instanceof Error ? e.message : 'That file could not be added.';
      setError(message);
      Alert.alert('Upload failed', message);
    }
  }

  function confirmDelete(item: Attachment) {
    if (!canWrite) return;
    Alert.alert('Remove media', 'Remove this from the task?', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => deleteAttachment.mutate({ id: item.id, path: item.path }),
      },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <FieldLabel>Media</FieldLabel>

      {items.length === 0 && !canWrite ? (
        <Text variant="meta" color={colors.inkFaint}>
          No photos or videos yet.
        </Text>
      ) : null}

      <View style={styles.grid}>
        {items.map((item) =>
          item.media_type === 'video' ? (
            <VideoTile key={item.id} url={item.url} onLongPress={() => confirmDelete(item)} />
          ) : (
            <Pressable key={item.id} onLongPress={() => confirmDelete(item)} style={styles.tile}>
              {item.url ? (
                <Image source={{ uri: item.url }} style={styles.media} contentFit="cover" />
              ) : null}
            </Pressable>
          ),
        )}

        {canWrite ? (
          <Pressable
            onPress={pick}
            disabled={addAttachment.isPending}
            accessibilityRole="button"
            accessibilityLabel="Add photo or video"
            style={[styles.tile, styles.addTile]}
          >
            <Ionicons
              name={addAttachment.isPending ? 'hourglass-outline' : 'add'}
              size={26}
              color={colors.brand}
            />
            <Text variant="meta" color={colors.brand}>
              {addAttachment.isPending ? 'Adding' : 'Add'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function VideoTile({ url, onLongPress }: { url: string | null; onLongPress: () => void }) {
  const player = useVideoPlayer(url ?? '', (p) => {
    p.loop = true;
  });
  return (
    <Pressable onLongPress={onLongPress} style={styles.tile}>
      <VideoView style={styles.media} player={player} nativeControls contentFit="cover" />
    </Pressable>
  );
}

const TILE = 104;
const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  media: { width: '100%', height: '100%' },
  addTile: { alignItems: 'center', justifyContent: 'center', gap: 2, borderStyle: 'dashed' },
});
