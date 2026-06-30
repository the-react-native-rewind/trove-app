import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from 'react-native';

import { colors, type as typeScale } from '@/theme/tokens';

type Variant = keyof typeof typeScale;

type TextProps = RNTextProps & {
  variant?: Variant;
  color?: string;
  center?: boolean;
};

export function Text({ variant = 'body', color = colors.ink, center, style, ...rest }: TextProps) {
  return (
    <RNText
      style={[typeScale[variant], { color }, center && styles.center, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});
