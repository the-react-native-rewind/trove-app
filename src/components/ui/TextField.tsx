import { forwardRef } from 'react';
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
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helper, error, style, ...rest },
  ref,
) {
  return (
    <View style={styles.wrap}>
      <Text variant="label" color={colors.inkSoft} style={styles.label}>
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.inkFaint}
        style={[styles.input, !!error && styles.inputError, style]}
        {...rest}
      />
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
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.ink,
    ...typeScale.body,
  },
  inputError: { borderColor: colors.priorityHigh },
  helper: { marginLeft: 2 },
});
