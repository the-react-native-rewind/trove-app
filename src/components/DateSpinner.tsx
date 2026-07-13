import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

import { toDateString } from '@/lib/format';
import { colors } from '@/theme/tokens';

export type DateSpinnerProps = {
  visible: boolean;
  value: string | null; // YYYY-MM-DD
  onChange: (date: string | null) => void;
  onClose: () => void;
};

/** Native (iOS/Android) date picker. A `.web` sibling handles the browser. */
export function DateSpinner({ visible, value, onChange, onClose }: DateSpinnerProps) {
  if (!visible) return null;
  return (
    <DateTimePicker
      value={value ? new Date(`${value}T00:00:00`) : new Date()}
      mode="date"
      display={Platform.OS === 'ios' ? 'inline' : 'default'}
      themeVariant="light"
      accentColor={colors.brand}
      onChange={(event, date) => {
        if (Platform.OS !== 'ios') onClose();
        if (event.type === 'set' && date) onChange(toDateString(date));
      }}
    />
  );
}
