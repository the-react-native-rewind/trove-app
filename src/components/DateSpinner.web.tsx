import { colors, fonts, radii } from '@/theme/tokens';
import type { DateSpinnerProps } from './DateSpinner';

/**
 * Web date field. `@react-native-community/datetimepicker` has no web build,
 * so on web we render a native HTML date input (react-dom renders this file).
 */
export function DateSpinner({ visible, value, onChange }: DateSpinnerProps) {
  if (!visible) return null;
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      style={{
        fontSize: 16,
        padding: '10px 12px',
        borderRadius: radii.button,
        border: `1px solid ${colors.hairline}`,
        backgroundColor: colors.surface,
        color: colors.ink,
        fontFamily: fonts.bodyRegular,
        alignSelf: 'flex-start',
      }}
    />
  );
}
