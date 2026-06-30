import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { supabase } from '@/lib/supabase';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSignIn() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError('That email and password do not match. Try again.');
      return;
    }
    router.replace('/');
  }

  async function onForgotPassword() {
    if (!email.trim()) {
      setError('Enter your email first, then tap reset.');
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) {
      setError('We could not send a reset link. Check the email and try again.');
      return;
    }
    Alert.alert('Check your email', 'We sent a link to reset your password.');
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.wordmark}>Trove</Text>
            <Text variant="body" color={colors.inkSoft} style={styles.tagline}>
              Shared task boards for real life.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              textContentType="emailAddress"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
            />

            {error ? (
              <Text variant="meta" color={colors.priorityHigh}>
                {error}
              </Text>
            ) : null}

            <Button label="Sign in" onPress={onSignIn} loading={loading} />

            <View style={styles.actionRow}>
              <Text
                variant="meta"
                color={colors.brand}
                onPress={onForgotPassword}
                suppressHighlighting
              >
                Forgot password?
              </Text>
            </View>
          </View>

          <View style={styles.footer}>
            <Text variant="body" color={colors.inkSoft}>
              New here?{' '}
            </Text>
            <Link href="/(auth)/sign-up" replace suppressHighlighting>
              <Text variant="bodyMedium" color={colors.brand}>
                Create an account
              </Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl * 1.5, paddingBottom: spacing.xl },
  header: { marginBottom: spacing.xxl },
  wordmark: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 54, color: colors.brandDeep },
  tagline: { marginTop: spacing.xs },
  form: { gap: spacing.lg },
  actionRow: { alignItems: 'flex-end' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 'auto', paddingTop: spacing.xl },
});
