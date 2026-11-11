import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { colors, fonts } from '@/theme/tokens';

/**
 * The app's standard header for pushed screens: the native stack header with
 * the system back button and swipe-back. When there's nothing to go back to
 * (a web deep link or refresh), it shows a close button that goes home, so a
 * screen never dead-ends.
 */
export function StandardHeader({ title }: { title: string }) {
  const router = useRouter();
  const canGoBack = router.canGoBack();
  return (
    <Stack.Screen
      options={{
        headerShown: true,
        title,
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.paper },
        headerTitleStyle: { fontFamily: fonts.displaySemiBold, fontSize: 18, color: colors.ink },
        headerLeft: canGoBack
          ? undefined
          : () => (
              <Pressable
                onPress={() => router.replace('/' as never)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={{ paddingHorizontal: 8 }}
              >
                <Ionicons name="close" size={24} color={colors.ink} />
              </Pressable>
            ),
      }}
    />
  );
}
