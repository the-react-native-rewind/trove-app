import { Pressable, StyleSheet, View } from 'react-native';
import Toast from 'react-native-toast-message';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';

import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { Text } from './Text';

export type UndoToastProps = { onUndo?: () => void };

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

function UndoToast({ text1, props }: ToastConfigParams<UndoToastProps>) {
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: colors.honey }]} />
      <View style={styles.content}>
        {text1 ? (
          <Text variant="cardTitle" numberOfLines={1}>
            {text1}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => {
          props.onUndo?.();
          Toast.hide();
        }}
        accessibilityRole="button"
        accessibilityLabel="Undo"
        style={styles.undo}
      >
        <Text variant="bodyMedium" color={colors.brandDeep}>
          Undo
        </Text>
      </Pressable>
    </View>
  );
}

export function showUndoToast(text1: string, onUndo: () => void) {
  Toast.show({
    type: 'undo',
    text1,
    visibilityTime: 4500,
    props: { onUndo } satisfies UndoToastProps,
  });
}

export const toastConfig: ToastConfig = {
  success: (props) => <ToastCard {...props} accent={colors.brand} />,
  error: (props) => <ToastCard {...props} accent={colors.priorityHigh} />,
  info: (props) => <ToastCard {...props} accent={colors.honey} />,
  undo: (props) => <UndoToast {...props} />,
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
  undo: {
    justifyContent: 'center',
    paddingRight: spacing.lg,
    paddingLeft: spacing.sm,
  },
});
