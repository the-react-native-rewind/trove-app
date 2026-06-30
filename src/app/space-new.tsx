import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useCreateSpace } from '@/data/spaces';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, spacing } from '@/theme/tokens';

export default function NewSpace() {
  const router = useRouter();
  const { setSelectedSpaceId } = useSelectedSpace();
  const createSpace = useCreateSpace();

  const [name, setName] = useState('');
  const [color, setColor] = useState('sage');
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    if (!name.trim()) {
      setError('Give your space a name, like Home or Garden.');
      return;
    }
    try {
      const space = await createSpace.mutateAsync({ name, color });
      setSelectedSpaceId(space.id);
      router.back();
    } catch {
      setError('We could not create that space. Try again.');
    }
  }

  return (
    <ModalScaffold
      title="New space"
      footer={<Button label="Create space" onPress={onCreate} loading={createSpace.isPending} />}
    >
      <View style={{ gap: spacing.xs }}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Home, Garden, Choir..."
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onCreate}
        />
        <Text variant="meta" color={colors.inkFaint} style={{ marginLeft: 2, marginTop: spacing.xs }}>
          Yours alone until you add someone.
        </Text>
      </View>

      <ColorPicker value={color} onChange={setColor} />

      {error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {error}
        </Text>
      ) : null}
    </ModalScaffold>
  );
}
