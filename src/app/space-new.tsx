import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { ProLock } from '@/components/ProLock';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { usePro } from '@/data/pro';
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
  const { isPro, isLoading: proLoading } = usePro();

  async function onCreate() {
    setError(null);
    if (!name.trim()) {
      setError('Give your circle a name, like Home or Garden.');
      return;
    }
    try {
      const space = await createSpace.mutateAsync({ name, color });
      setSelectedSpaceId(space.id);
      router.back();
    } catch {
      setError('We could not create that circle. Try again.');
    }
  }

  if (!proLoading && !isPro) {
    return (
      <ProLock
        title="Room for every circle"
        body="You’ve got the circles Trove set up. New ones — a circle for each project and part of life — come with Trove Pro. Inviting people is always free."
      />
    );
  }

  return (
    <ModalScaffold
      title="New circle"
      footer={<Button label="Create circle" onPress={onCreate} loading={createSpace.isPending} />}
    >
      <View style={{ gap: spacing.xs }}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Home, Garden, Community..."
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
