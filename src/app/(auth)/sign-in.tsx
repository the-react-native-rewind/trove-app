import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useIsWide } from '@/hooks/useIsWide';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radii, shadows, spacing } from '@/theme/tokens';

const FEATURES = [
  {
    icon: 'people-outline' as const,
    title: 'Work together',
    body: 'Create boards and get everyone on the same page.',
  },
  {
    icon: 'checkmark-circle-outline' as const,
    title: 'Stay organised',
    body: 'Tasks, lists and due dates that actually make sense.',
  },
  {
    icon: 'leaf-outline' as const,
    title: 'Built for real life',
    body: 'Simple, beautiful and made to be used every day.',
  },
];

function useSignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  return {
    email,
    setEmail,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    loading,
    error,
    onSignIn,
    onForgotPassword,
  };
}

function SignInFields({ form }: { form: ReturnType<typeof useSignInForm> }) {
  return (
    <View style={styles.form}>
      <TextField
        label="Email"
        value={form.email}
        onChangeText={form.setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        textContentType="emailAddress"
        leftIcon="mail-outline"
      />
      <TextField
        label="Password"
        value={form.password}
        onChangeText={form.setPassword}
        placeholder="Your password"
        secureTextEntry={!form.showPassword}
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        leftIcon="lock-closed-outline"
        rightElement={
          <Pressable
            onPress={() => form.setShowPassword((v: boolean) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={form.showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={form.showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={colors.inkFaint}
            />
          </Pressable>
        }
      />

      {form.error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {form.error}
        </Text>
      ) : null}

      <Button label="Sign in" onPress={form.onSignIn} loading={form.loading} />

      <View style={styles.actionRow}>
        <Text
          variant="meta"
          color={colors.brand}
          onPress={form.onForgotPassword}
          suppressHighlighting
        >
          Forgot password?
        </Text>
      </View>
    </View>
  );
}

function CreateAccountLine() {
  return (
    <View style={styles.footerRow}>
      <Text variant="body" color={colors.inkSoft}>
        New here?{' '}
      </Text>
      <Link href="/(auth)/sign-up" replace suppressHighlighting>
        <Text variant="bodyMedium" color={colors.brand}>
          Create an account
        </Text>
      </Link>
    </View>
  );
}

/** Desktop: branding panel on the left, centered sign-in card on the right. */
function WideSignIn({ form }: { form: ReturnType<typeof useSignInForm> }) {
  return (
    <View style={styles.wideRoot}>
      <View style={styles.leftPanel}>
        <View style={styles.leftContent}>
          <Text style={styles.wordmark}>Trove</Text>
          <Text variant="body" color={colors.inkSoft} style={styles.tagline}>
            Shared task boards for real life.
          </Text>

          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={f.icon} size={20} color={colors.brandDeep} />
                </View>
                <View style={styles.featureText}>
                  <Text variant="bodyMedium">{f.title}</Text>
                  <Text variant="meta" color={colors.inkSoft}>
                    {f.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <Image
          source={require('../../../assets/images/auth-hills.png')}
          style={styles.hills}
          contentFit="cover"
          contentPosition="bottom"
        />
      </View>

      <View style={styles.rightPanel}>
        <View style={styles.card}>
          <Text variant="screenTitle" center style={styles.cardTitle}>
            Welcome back
          </Text>
          <Text variant="body" color={colors.inkSoft} center style={styles.cardSub}>
            Sign in to your Trove account
          </Text>
          <SignInFields form={form} />
        </View>
        <CreateAccountLine />
      </View>
    </View>
  );
}

/** Phones: the sign-in form on its own, as before. */
function NarrowSignIn({ form }: { form: ReturnType<typeof useSignInForm> }) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.wordmark}>Trove</Text>
          <Text variant="body" color={colors.inkSoft} style={styles.tagline}>
            Shared task boards for real life.
          </Text>
        </View>
        <SignInFields form={form} />
        <View style={styles.narrowFooter}>
          <CreateAccountLine />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function SignIn() {
  const isWide = useIsWide();
  const form = useSignInForm();

  return (
    <Screen>
      {isWide ? <WideSignIn form={form} /> : <NarrowSignIn form={form} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { gap: spacing.lg },
  actionRow: { alignItems: 'flex-end' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },

  // Shared identity
  wordmark: { fontFamily: fonts.displayBold, fontSize: 44, lineHeight: 54, color: colors.brandDeep },
  tagline: { marginTop: spacing.xs },

  // Wide layout
  wideRoot: { flex: 1, flexDirection: 'row' },
  leftPanel: {
    width: '40%',
    backgroundColor: colors.paper,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  leftContent: { padding: spacing.xxl * 1.5, paddingBottom: 0 },
  features: { marginTop: spacing.xxl, gap: spacing.xl },
  featureRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, gap: 2, maxWidth: 280 },
  hills: { width: '100%', aspectRatio: 1000 / 640 },
  rightPanel: {
    flex: 1.2,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xxl,
    ...shadows.card,
  },
  cardTitle: { marginBottom: spacing.xs },
  cardSub: { marginBottom: spacing.xl },

  // Narrow layout
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 1.5,
    paddingBottom: spacing.xl,
  },
  header: { marginBottom: spacing.xxl },
  narrowFooter: { marginTop: 'auto', paddingTop: spacing.xl },
});
