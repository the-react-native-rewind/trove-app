import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
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

export default function SignUp() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  async function onSignUp() {
    setError(null);
    if (!name.trim()) {
      setError('Add your name so your people recognise you.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError('Use a valid email and a password of at least 6 characters.');
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });
    setLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    if (data.session) {
      router.replace('/');
    } else {
      setCheckEmail(true);
    }
  }

  if (checkEmail) {
    return (
      <Screen padded>
        <View style={styles.confirm}>
          <Text style={styles.wordmark}>Trove</Text>
          <Text variant="sectionHeading" style={styles.confirmTitle}>
            Confirm your email
          </Text>
          <Text variant="body" color={colors.inkSoft} center>
            We sent a link to {email.trim()}. Open it to finish setting up, then sign in.
          </Text>
          <Button
            label="Back to sign in"
            variant="secondary"
            onPress={() => router.replace('/(auth)/sign-in')}
            style={styles.confirmButton}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.wordmark}>Trove</Text>
            <Text variant="body" color={colors.inkSoft} style={styles.tagline}>
              Get it out of your head, onto everyone's plate.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Your name"
              value={name}
              onChangeText={setName}
              placeholder="Alex Rivera"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
            />
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
              placeholder="At least 6 characters"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password-new"
              textContentType="newPassword"
            />

            {error ? (
              <Text variant="meta" color={colors.priorityHigh}>
                {error}
              </Text>
            ) : null}

            <Button label="Create account" onPress={onSignUp} loading={loading} />
          </View>

          <View style={styles.footer}>
            <Text variant="body" color={colors.inkSoft}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/sign-in" replace suppressHighlighting>
              <Text variant="bodyMedium" color={colors.brand}>
                Sign in
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
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 1.2,
    paddingBottom: spacing.xl,
  },
  header: { marginBottom: spacing.xl },
  wordmark: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 54, color: colors.brandDeep },
  tagline: { marginTop: spacing.xs },
  form: { gap: spacing.lg },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
  confirm: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  confirmTitle: { marginTop: spacing.lg },
  confirmButton: { marginTop: spacing.lg, alignSelf: 'stretch' },
});
