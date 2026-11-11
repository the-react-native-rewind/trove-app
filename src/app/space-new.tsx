import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { ProSheet } from '@/components/ProSheet';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { FREE_CIRCLES, usePro } from '@/data/pro';
import { useCreateSpace, useSpaces } from '@/data/spaces';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, spacing } from '@/theme/tokens';

export default function NewSpace() {
  const router = useRouter();
  const { setSelectedSpaceId } = useSelectedSpace();
  const createSpace = useCreateSpace();
  const { data: spaces = [] } = useSpaces();

  const [name, setName] = useState('');
  const [color, setColor] = useState('sage');
  const [error, setError] = useState<string | null>(null);
  const { isPro, isLoading: proLoading } = usePro();
  const ownedCircles = spaces.filter((space) => !space.is_default).length;

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

  if (!proLoading && !isPro && ownedCircles >= FREE_CIRCLES) {
    return (
      <ProSheet
        title="Room for every circle"
        body={`Free Trove gives you ${FREE_CIRCLES} circles plus Personal. Add as many as you like with Pro — inviting people is always free.`}
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
