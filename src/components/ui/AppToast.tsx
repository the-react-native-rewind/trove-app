import { StyleSheet, View } from 'react-native';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';

import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Text } from './Text';

/**
 * Toasts styled as Trove cards: warm surface, hairline border, and a colored
 * accent bar instead of the library's default white-and-blue banner.
 */
function ToastCard({ text1, text2, accent }: ToastConfigParams<unknown> & { accent: string }) {
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.content}>
        {text1 ? (
          <Text variant="cardTitle" numberOfLines={1}>
            {text1}
          </Text>
        ) : null}
        {text2 ? (
          <Text variant="meta" color={colors.inkSoft} numberOfLines={1}>
            {text2}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: (props) => <ToastCard {...props} accent={colors.brand} />,
  error: (props) => <ToastCard {...props} accent={colors.priorityHigh} />,
  info: (props) => <ToastCard {...props} accent={colors.honey} />,
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '88%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    overflow: 'hidden',
    ...shadows.floating,
  },
  accent: {
    width: 4,
    borderTopLeftRadius: radii.card,
    borderBottomLeftRadius: radii.card,
  },
  content: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
});
