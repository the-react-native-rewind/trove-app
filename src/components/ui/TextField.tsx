import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ReactNode } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { colors, radii, spacing, type as typeScale } from '@/theme/tokens';
import { Text } from './Text';

type TextFieldProps = TextInputProps & {
  label: string;
  helper?: string;
  error?: string | null;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightElement?: ReactNode;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, error, leftIcon, rightElement, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.inkSoft} style={styles.label}>
        {label}
      </Text>
      <View style={[styles.inputRow, !!error && styles.inputError]}>
        {leftIcon ? (
          <Ionicons name={leftIcon} size={18} color={colors.inkFaint} style={styles.leftIcon} />
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, style]}
          {...rest}
        />
        {rightElement}
      </View>
      {error ? (
        <Text variant="meta" color={colors.priorityHigh} style={styles.helper}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="meta" color={colors.inkFaint} style={styles.helper}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { marginLeft: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
  },
  leftIcon: { marginRight: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.ink,
    ...typeScale.body,
  },
  inputError: { borderColor: colors.priorityHigh },
  helper: { marginLeft: 2 },
});
