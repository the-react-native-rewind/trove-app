import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { useAcceptInvite } from '@/data/members';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, spacing } from '@/theme/tokens';

export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { setSelectedSpaceId } = useSelectedSpace();
  const acceptInvite = useAcceptInvite();
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    setError(null);
    try {
      const spaceId = await acceptInvite.mutateAsync(token);
      setSelectedSpaceId(spaceId);
      router.replace('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'This invite could not be accepted.';
      setError(message);
    }
  }

  return (
    <ModalScaffold
      title="Join a space"
      footer={<Button label="Join space" onPress={onJoin} loading={acceptInvite.isPending} />}
    >
      <View style={styles.body}>
        <EmptyState
          icon="mail-open-outline"
          title="You've been invited"
          body="Join this space to see the part of the list that's yours, and nothing else."
        />
        {error ? (
          <Text variant="meta" color={colors.priorityHigh} center>
            {error}
          </Text>
        ) : null}
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.lg },
});
