import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { ColorPicker } from '@/components/form';
import { ProSheet } from '@/components/ProSheet';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { FREE_CIRCLES, usePro } from '@/data/pro';
import { useCreateSpace, useSpaces } from '@/data/spaces';
import { useAuth } from '@/providers/AuthProvider';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, spacing } from '@/theme/tokens';

export default function NewSpace() {
  const router = useRouter();
  const { setSelectedSpaceId } = useSelectedSpace();
  const createSpace = useCreateSpace();
  const { userId } = useAuth();
  const { data: spaces = [], isLoading: spacesLoading } = useSpaces();

  const [name, setName] = useState('');
  const [color, setColor] = useState('sage');
  const [error, setError] = useState<string | null>(null);
  const { isPro, isLoading: proLoading } = usePro();
  const [hitLimit, setHitLimit] = useState(false);
  // Only circles you own count. Circles you were invited into are always free.
  const ownedCircles = spaces.filter(
    (space) => !space.is_default && space.owner_id === userId,
  ).length;

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
    } catch (e) {
      // The database enforces the free limit too (migration 0037).
      if (String((e as { message?: string } | null)?.message ?? '').includes('trove_pro_required')) {
        setHitLimit(true);
        return;
      }
      setError('We could not create that circle. Try again.');
    }
  }

  if (proLoading || spacesLoading) {
    return (
      <ModalScaffold title="New circle">
        <ActivityIndicator color={colors.brand} />
      </ModalScaffold>
    );
  }

  if (hitLimit || (!isPro && ownedCircles >= FREE_CIRCLES)) {
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
