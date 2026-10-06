import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { describeScope, splitScopes } from '@/lib/oauthScopes';
import { clearOAuthConsent, rememberOAuthConsent } from '@/lib/pendingOAuth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing } from '@/theme/tokens';

type ConsentDetails = {
  authorizationId: string;
  clientName: string;
  logoUri: string;
  redirectHost: string;
  scopes: string[];
};

export default function OAuthConsent() {
  const router = useRouter();
  const { session, initializing } = useAuth();
  const params = useLocalSearchParams<{ authorization_id?: string | string[] }>();
  const authorizationId = firstParam(params.authorization_id);
  const [loaded, setLoaded] = useState<{ id: string; details: ConsentDetails | null; error: string | null } | null>(null);
  const [decisionError, setDecisionError] = useState<{ id: string; message: string } | null>(null);
  const [deciding, setDeciding] = useState<'approve' | 'deny' | null>(null);
  const current = loaded?.id === authorizationId ? loaded : null;
  const details = current?.details ?? null;
  const error = (decisionError?.id === authorizationId ? decisionError.message : null) ?? current?.error ?? null;
  const loading = Boolean(!initializing && session && authorizationId && !current);

  useEffect(() => {
    if (authorizationId) void clearOAuthConsent();
  }, [authorizationId]);

  useEffect(() => {
    if (initializing || !session || !authorizationId) return;
    let cancelled = false;
    const id = authorizationId;
    void supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error: detailsError }) => {
      if (cancelled) return;
      if (detailsError || !data) {
        setLoaded({
          id,
          details: null,
          error: detailsError?.message ?? 'This connection request is no longer valid. Start again from the assistant.',
        });
        return;
      }
      if (!('authorization_id' in data)) {
        followRedirect(data.redirect_url);
        return;
      }
      setLoaded({
        id,
        error: null,
        details: {
          authorizationId: data.authorization_id,
          clientName: data.client.name || 'An assistant',
          logoUri: data.client.logo_uri,
          redirectHost: hostOf(data.redirect_uri),
          scopes: splitScopes(data.scope),
        },
      });
    }).catch((caught: unknown) => {
      if (cancelled) return;
      setLoaded({
        id,
        details: null,
        error: caught instanceof Error ? caught.message : 'Trove could not load this connection request.',
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authorizationId, initializing, session]);

  async function onSignIn() {
    if (!authorizationId) return;
    await rememberOAuthConsent(authorizationId);
    router.push('/(auth)/sign-in');
  }

  async function onDecide(decision: 'approve' | 'deny') {
    if (!details) return;
    setDeciding(decision);
    setDecisionError(null);
    const call = decision === 'approve'
      ? supabase.auth.oauth.approveAuthorization(details.authorizationId, { skipBrowserRedirect: true })
      : supabase.auth.oauth.denyAuthorization(details.authorizationId, { skipBrowserRedirect: true });
    const { data, error: decisionError } = await call;
    if (decisionError || !data?.redirect_url) {
      setDeciding(null);
      setDecisionError({
        id: details.authorizationId,
        message: decisionError?.message ?? 'Trove could not finish that choice. Try again.',
      });
      return;
    }
    followRedirect(data.redirect_url);
  }

  return (
    <Screen padded edges={['top', 'bottom']}>
      <View style={styles.page}>
        <Text variant="screenTitle" accessibilityRole="header">
          Connect an assistant
        </Text>
        {!authorizationId ? (
          <Text variant="body" color={colors.inkSoft}>
            This link is missing its authorization id. Start the connection again from the assistant.
          </Text>
        ) : null}
        {authorizationId && !initializing && !session ? (
          <View style={styles.card}>
            <Text variant="body" color={colors.inkSoft}>
              Sign in to Trove to choose whether this assistant can use your circles.
            </Text>
            <Button label="Sign in" onPress={onSignIn} />
          </View>
        ) : null}
        {loading || initializing ? <ActivityIndicator color={colors.brand} /> : null}
        {error ? (
          <Text variant="body" color={colors.priorityHigh}>
            {error}
          </Text>
        ) : null}
        {details ? (
          <View style={styles.card}>
            {details.logoUri ? (
              <Image source={{ uri: details.logoUri }} style={styles.logo} contentFit="contain" accessibilityIgnoresInvertColors />
            ) : null}
            <Text variant="cardTitle">{details.clientName}</Text>
            <Text variant="body" color={colors.inkSoft}>
              wants to use Trove as you. It can see and change the circles and tasks you can. It cannot see a circle you have not joined.
            </Text>
            {details.scopes.length > 0 ? (
              <View style={styles.scopes}>
                {details.scopes.map((scope) => (
                  <Text key={scope} variant="body">
                    {describeScope(scope)}
                  </Text>
                ))}
              </View>
            ) : null}
            <Text variant="meta" color={colors.inkFaint}>
              {details.redirectHost
                ? `If you allow this, you go back to ${details.redirectHost}.`
                : 'If you allow this, you go back to the assistant.'}{' '}
              You can disconnect it later under Account, then Connect an AI assistant.
            </Text>
            <Button
              label="Allow"
              onPress={() => onDecide('approve')}
              loading={deciding === 'approve'}
              disabled={deciding !== null}
            />
            <Button
              label="Don't allow"
              variant="secondary"
              onPress={() => onDecide('deny')}
              loading={deciding === 'deny'}
              disabled={deciding !== null}
            />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function firstParam(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? '';
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host;
  } catch {
    return '';
  }
}

function followRedirect(url: string) {
  if (typeof window !== 'undefined' && typeof window.location?.assign === 'function') {
    window.location.assign(url);
    return;
  }
  void Linking.openURL(url);
}

const styles = StyleSheet.create({
  page: { flex: 1, gap: spacing.lg, maxWidth: 440, width: '100%', alignSelf: 'center', paddingTop: spacing.xl },
  card: { gap: spacing.md, padding: spacing.lg, borderRadius: radii.card, backgroundColor: colors.surface },
  logo: { width: 48, height: 48, borderRadius: radii.sm },
  scopes: { gap: spacing.xs },
});
