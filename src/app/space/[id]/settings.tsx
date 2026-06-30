import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useLeaveSpace } from '@/data/members';
import { useDeleteSpace, useSpaces, useUpdateSpace } from '@/data/spaces';
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

  const [name, setName] = useState('');
  const [color, setColor] = useState('sage');

  useEffect(() => {
    if (space) {
      setName(space.name);
      setColor(space.color);
    }
  }, [space?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!space) {
    return (
      <ModalScaffold title="Space settings">
        <Text variant="body" color={colors.inkSoft}>
          This space is no longer available.
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

  function onDelete() {
    Alert.alert(
      `Delete ${space!.name}?`,
      'This permanently removes the space and all its tasks for everyone. This cannot be undone.',
      [
        { text: 'Keep space', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteSpace.mutateAsync(space!.id);
            setSelectedSpaceId('all');
            router.back();
          },
        },
      ],
    );
  }

  function onLeave() {
    Alert.alert(`Leave ${space!.name}?`, 'You will no longer see this space or its tasks.', [
      { text: 'Stay', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveSpace.mutateAsync(space!.id);
          setSelectedSpaceId('all');
          router.back();
        },
      },
    ]);
  }

  return (
    <ModalScaffold
      title="Space settings"
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
            Only owners and admins can change this space.
          </Text>
        </View>
      )}

      <View style={styles.danger}>
        {isOwner ? (
          space.is_default ? (
            <Text variant="meta" color={colors.inkFaint}>
              Personal is your private space. It can't be deleted.
            </Text>
          ) : (
            <Button label="Delete space" variant="danger" onPress={onDelete} />
          )
        ) : (
          <Button label="Leave space" variant="danger" onPress={onLeave} />
        )}
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: spacing.xl },
});
