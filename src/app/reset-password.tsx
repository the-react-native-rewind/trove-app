import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function ResetPassword() {
  const router = useRouter();
  const { session, clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setError(null);
    if (password.length < 6) {
      setError('Use a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    clearRecovery();
    router.replace('/');
  }

  if (!session) {
    return (
      <Screen padded>
        <View style={styles.wrap}>
          <Text style={styles.wordmark}>Trove</Text>
          <Text variant="sectionHeading">Reset link expired</Text>
          <Text variant="body" color={colors.inkSoft}>
            Open the link from your email again, or request a new one from sign in.
          </Text>
          <Link href="/(auth)/sign-in" replace suppressHighlighting>
            <Text variant="bodyMedium" color={colors.brand}>
              Back to sign in
            </Text>
          </Link>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded>
      <View style={styles.wrap}>
        <Text style={styles.wordmark}>Trove</Text>
        <Text variant="sectionHeading">Choose a new password</Text>
        <TextField
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
        />
        {error ? (
          <Text variant="meta" color={colors.priorityHigh}>
            {error}
          </Text>
        ) : null}
        <Button label="Save password" onPress={onSave} loading={loading} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
  },
  wordmark: {
    fontFamily: fonts.displayBold,
    fontSize: 40,
    lineHeight: 48,
    color: colors.brandDeep,
  },
});
