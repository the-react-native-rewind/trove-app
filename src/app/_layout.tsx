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
import { useIsWide } from '@/hooks/useIsWide';
import { withCodePush } from '@/lib/codePush';
import { readPendingInvite } from '@/lib/pendingInvite';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { SpaceProvider } from '@/providers/SpaceProvider';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

function useProtectedRoute() {
  const { session, initializing, recovery } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (initializing) return;
    const root = segments[0];
    const inAuthGroup = root === '(auth)';
    const onInvite = root === 'invite';
    const onReset = root === 'reset-password';

    if (recovery) {
      if (!onReset) router.replace('/reset-password');
      return;
    }

    if (!session) {
      if (!inAuthGroup && !onInvite) router.replace('/(auth)/sign-in');
      return;
    }

    // Only leave the auth screens automatically. Doing this from every route
    // would send someone who dismissed an invite straight back to it.
    if (inAuthGroup) {
      void readPendingInvite().then((token) => {
        router.replace(token ? (`/invite/${token}` as never) : '/');
      });
    }
  }, [session, initializing, recovery, segments, router]);
}

function RootNavigator() {
  const { initializing } = useAuth();
  const isWide = useIsWide();
  useProtectedRoute();

  if (initializing) return null; // splash stays up

  // On wide screens, present these routes as transparent overlays so the board
  // stays visible behind the ModalScaffold's dimmed, centered dialog. On phones
  // they're regular full-screen modals.
  const modalOptions = {
    presentation: (isWide ? 'transparentModal' : 'modal') as 'transparentModal' | 'modal',
    animation: (isWide ? 'fade' : 'default') as 'fade' | 'default',
    contentStyle: { backgroundColor: isWide ? 'transparent' : colors.paper },
  };

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
      <Stack.Screen name="task-new" options={modalOptions} />
      <Stack.Screen name="task/[id]/index" options={modalOptions} />
      <Stack.Screen name="task/[id]/edit" options={modalOptions} />
      <Stack.Screen name="space-new" options={modalOptions} />
      <Stack.Screen name="space/[id]/members" options={modalOptions} />
      <Stack.Screen name="space/[id]/settings" options={modalOptions} />
      <Stack.Screen name="account" options={modalOptions} />
      <Stack.Screen name="connect" options={modalOptions} />
      <Stack.Screen name="invite/[token]" options={modalOptions} />
      <Stack.Screen name="reset-password" />
    </Stack>
  );
}

function RootLayout() {
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
    <GestureHandlerRootView style={{ flex: 1 }}>
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

// CodePush wraps the root component: it checks Codemagic's CodePush server for
// OTA updates and swaps in the new JavaScript bundle (see src/lib/codePush.ts).
export default withCodePush(RootLayout);
