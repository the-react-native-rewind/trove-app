import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useLeaveSpace } from '@/data/members';
import { useDeleteSpace, useSpaces, useUpdateSpace } from '@/data/spaces';
import { confirmDialog } from '@/lib/dialog';
import { canManage } from '@/lib/types';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, resolveAccent, spacing } from '@/theme/tokens';

export default function SpaceSettings() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { setSelectedSpaceId } = useSelectedSpace();
  const { data: spaces = [] } = useSpaces();
  const space = spaces.find((s) => s.id === spaceId);

  const updateSpace = useUpdateSpace();
  const deleteSpace = useDeleteSpace();
  const leaveSpace = useLeaveSpace();

  const [name, setName] = useState(space?.name ?? '');
  const [color, setColor] = useState(space?.color ?? 'sage');
  const [seenSpaceId, setSeenSpaceId] = useState(space?.id);
  if (space && space.id !== seenSpaceId) {
    setSeenSpaceId(space.id);
    setName(space.name);
    setColor(space.color);
  }

  if (!space) {
    return (
      <ModalScaffold title="Circle settings">
        <Text variant="body" color={colors.inkSoft}>
          This circle is no longer available.
        </Text>
      </ModalScaffold>
    );
  }

  const manager = canManage(space.role);
  const isOwner = space.role === 'owner';
  const dirty = name.trim() !== space.name || resolveAccent(color) !== resolveAccent(space.color);

  async function onSave() {
    if (!name.trim()) return;
    await updateSpace.mutateAsync({ id: space!.id, name, color });
  }

  async function onDelete() {
    const confirmed = await confirmDialog({
      title: `Delete ${space!.name}?`,
      message:
        'This permanently removes the circle and all its tasks for everyone. This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Keep circle',
      destructive: true,
    });
    if (!confirmed) return;
    await deleteSpace.mutateAsync(space!.id);
    setSelectedSpaceId('all');
    router.back();
  }

  async function onLeave() {
    const confirmed = await confirmDialog({
      title: `Leave ${space!.name}?`,
      message: 'You will no longer see this circle or its tasks.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay',
      destructive: true,
    });
    if (!confirmed) return;
    await leaveSpace.mutateAsync(space!.id);
    setSelectedSpaceId('all');
    router.back();
  }

  return (
    <ModalScaffold
      title="Circle settings"
      footer={
        manager && dirty ? (
          <Button label="Save changes" onPress={onSave} loading={updateSpace.isPending} />
        ) : undefined
      }
    >
      {manager ? (
        <>
          <TextField label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <ColorPicker value={color} onChange={setColor} />
        </>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Text variant="screenTitle">{space.name}</Text>
          <Text variant="meta" color={colors.inkFaint}>
            Only owners and admins can change this circle.
          </Text>
        </View>
      )}

      <View style={styles.danger}>
        {isOwner ? (
          space.is_default ? (
            <Text variant="meta" color={colors.inkFaint}>
              Personal is your private circle. It cannot be deleted.
            </Text>
          ) : (
            <Button label="Delete circle" variant="danger" onPress={onDelete} />
          )
        ) : (
          <Button label="Leave circle" variant="danger" onPress={onLeave} />
        )}
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: spacing.xl },
});
