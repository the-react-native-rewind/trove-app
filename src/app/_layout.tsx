import {
  Fraunces_400Regular,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/hanken-grotesk';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import '@/lib/devtools';
import { AnimatedSplash } from '@/components/AnimatedSplash';
import { toastConfig } from '@/components/ui/AppToast';
import { Celebration } from '@/components/Celebration';
import { useProfile } from '@/data/profile';
import { hrefAfterSignIn } from '@/lib/pendingOAuth';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { SpaceProvider } from '@/providers/SpaceProvider';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

function useProtectedRoute() {
  const { session, initializing, recovery } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const root = segments[0];
    const inAuthGroup = root === '(auth)';
    const inOnboarding = root === '(onboarding)';
    const onInvite = root === 'invite';
    const onOAuth = root === 'oauth';
    const onReset = root === 'reset-password';

    if (recovery) {
      if (!onReset) router.replace('/reset-password');
      return;
    }

    if (!session) {
      // The welcome screen is the signed-out landing; onboarding's first step is
      // reachable while signed out (it signs you in anonymously).
      if (!inAuthGroup && !inOnboarding && !onInvite && !onOAuth) {
        router.replace('/(auth)/welcome' as never);
      }
      return;
    }

    // Signed in but never onboarded (new anonymous or email account) → onboarding.
    // Existing accounts were backfilled, so they skip straight past this.
    if (!profileLoading && profile && !profile.onboarded_at && !inOnboarding && !onInvite && !onOAuth) {
      router.replace('/(onboarding)/name' as never);
      return;
    }

    // Only leave the auth screens automatically. Doing this from every route
    // would send someone who dismissed an invite straight back to it.
    // OAuth consent is checked first so a sign-in returns to the assistant.
    if (inAuthGroup) {
      void hrefAfterSignIn().then((href) => {
        router.replace(href as never);
      });
    }
  }, [session, initializing, recovery, segments, router, profile, profileLoading]);
}

function RootNavigator() {
  const { initializing } = useAuth();
  useProtectedRoute();

  if (initializing) return null; // splash stays up

  // Transparent on every size so ModalScaffold can fade the dim and slide only
  // the sheet. A native modal animation would move the backdrop with it.
  const modalOptions = {
    presentation: 'transparentModal' as const,
    animation: 'none' as const,
    contentStyle: { backgroundColor: 'transparent' },
  };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="mine/completed" />
      <Stack.Screen name="task-new" options={modalOptions} />
      <Stack.Screen name="task/[id]/index" />
      <Stack.Screen name="task/[id]/edit" options={modalOptions} />
      <Stack.Screen name="space-new" options={modalOptions} />
      <Stack.Screen name="space/[id]/members" options={modalOptions} />
      <Stack.Screen name="space/[id]/settings" options={modalOptions} />
      <Stack.Screen name="space/[id]/completed" />
      <Stack.Screen name="space/[id]/analytics" />
      <Stack.Screen name="space/[id]/project/[projectId]" />
      <Stack.Screen name="account" options={modalOptions} />
      <Stack.Screen name="paywall" options={modalOptions} />
      <Stack.Screen name="connect" options={modalOptions} />
      <Stack.Screen name="oauth/consent" />
      <Stack.Screen name="invite/[token]" options={modalOptions} />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

export default function RootLayout() {
  const [splashDone, setSplashDone] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, overflow: 'hidden' }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SpaceProvider>
              <StatusBar style="dark" />
              <RootNavigator />
              <Celebration />
              {!splashDone ? <AnimatedSplash onDone={() => setSplashDone(true)} /> : null}
            </SpaceProvider>
          </AuthProvider>
        </QueryClientProvider>
        {/* Must stay the last child so toasts render above modals and overlays. */}
        <Toast config={toastConfig} topOffset={60} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
