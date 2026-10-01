import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { useAcceptInvite } from '@/data/members';
import { clearPendingInvite, rememberPendingInvite } from '@/lib/pendingInvite';
import { useAuth } from '@/providers/AuthProvider';
import { useSelectedSpace } from '@/providers/SpaceProvider';
import { colors, spacing } from '@/theme/tokens';

export default function AcceptInvite() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { setSelectedSpaceId } = useSelectedSpace();
  const acceptInvite = useAcceptInvite();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) void rememberPendingInvite(token);
  }, [token]);

  async function onJoin() {
    setError(null);
    try {
      const spaceId = await acceptInvite.mutateAsync(token);
      await clearPendingInvite();
      setSelectedSpaceId(spaceId);
      router.replace('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'This invite could not be accepted.';
      setError(message);
    }
  }

  async function onNotNow() {
    await clearPendingInvite();
    router.replace(session ? '/' : '/(auth)/sign-in');
  }

  return (
    <ModalScaffold
      title="Join a space"
      footer={
        session ? (
          <Button label="Join space" onPress={onJoin} loading={acceptInvite.isPending} />
        ) : undefined
      }
    >
      <View style={styles.body}>
        <EmptyState
          icon="mail-open-outline"
          title="You have been invited"
          body="Join this group and you will see the whole shared list, plus everything assigned to you across your other groups."
        />
        {session ? null : (
          <View style={styles.auth}>
            <Text variant="body" color={colors.inkSoft} center>
              Sign in or create an account with the invited email, then you will land back here.
            </Text>
            <Link href="/(auth)/sign-in" replace suppressHighlighting>
              <Text variant="bodyMedium" color={colors.brand}>
                Sign in
              </Text>
            </Link>
            <Link href="/(auth)/sign-up" replace suppressHighlighting>
              <Text variant="bodyMedium" color={colors.brand}>
                Create an account
              </Text>
            </Link>
          </View>
        )}
        {error ? (
          <Text variant="meta" color={colors.priorityHigh} center>
            {error}
          </Text>
        ) : null}
        <Button label="Not now" variant="ghost" onPress={onNotNow} />
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.lg },
  auth: { alignItems: 'center', gap: spacing.md },
});
