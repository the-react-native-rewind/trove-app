import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';
import { Text } from './Text';

/** A pushed screen with a back button. Used where a task or list used to be a modal. */
export function StackScreen({
  title,
  children,
  footer,
  onBack,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={28} color={colors.ink} />
        </Pressable>
        <Text variant="sectionHeading" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  back: { padding: spacing.xs },
  title: { flex: 1 },
  scroll: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
});
