import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useIsWide } from '@/hooks/useIsWide';
import { formatDayLabel } from '@/lib/format';
import { hapticLight } from '@/lib/haptics';
import { localToday, shiftDay } from '@/lib/today';
import { colors, radii, shadows, spacing } from '@/theme/tokens';
import { DateSpinner } from './DateSpinner';
import { Button } from './ui/Button';
import { FadeSheet, SheetBottom } from './ui/FadeSheet';
import { Text } from './ui/Text';

/** Today, Tomorrow, or the date, for a day an action is planned on. */
export function planDayLabel(day: string, asOf = localToday()): string {
  if (day === asOf) return 'Today';
  if (day === shiftDay(asOf, 1)) return 'Tomorrow';
  return formatDayLabel(day);
}

/**
 * Pick which day's plan an action goes on. Opened by holding the Today chip.
 * `currentDay` is the day it is planned on now, if any.
 */
export function ScheduleDaySheet({
  title,
  currentDay,
  onPick,
  onRemove,
  onClose,
}: {
  /** The action's title. Null closes the sheet. */
  title: string | null;
  currentDay: string | null;
  onPick: (day: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const isWide = useIsWide();
  const today = localToday();
  const tomorrow = shiftDay(today, 1);
  const [heldTitle, setHeldTitle] = useState(title);
  const [showPicker, setShowPicker] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  // Keep the last title on screen while the sheet slides away, and start each
  // opening with the calendar closed.
  if (title !== null && title !== heldTitle) {
    setHeldTitle(title);
    setShowPicker(false);
    setPicked(null);
  }

  return (
    <FadeSheet visible={title !== null} wide={isWide} scroll onClose={onClose}>
      <SheetBottom style={[styles.sheet, isWide && styles.sheetWide]}>
        <View style={styles.header}>
          <Text variant="sectionHeading" style={styles.headerTitle}>
            Put on a day
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={colors.inkSoft} />
          </Pressable>
        </View>
        {heldTitle ? (
          <Text variant="meta" color={colors.inkSoft} numberOfLines={2}>
            {heldTitle}
          </Text>
        ) : null}

        <DayRow label="Today" selected={currentDay === today} onPress={() => onPick(today)} />
        <DayRow label="Tomorrow" selected={currentDay === tomorrow} onPress={() => onPick(tomorrow)} />
        <DayRow
          label={picked ? formatDayLabel(picked) : 'Pick a date'}
          icon="calendar-outline"
          selected={false}
          onPress={() => setShowPicker((shown) => !shown)}
        />
        <DateSpinner
          visible={showPicker}
          value={picked ?? currentDay ?? tomorrow}
          minimumDate={today}
          onChange={(date) => {
            if (date && date >= today) setPicked(date);
          }}
          onClose={() => setShowPicker(false)}
        />
        {picked ? (
          <Button label={`Put on ${planDayLabel(picked, today)}`} size="md" onPress={() => onPick(picked)} />
        ) : null}
        {currentDay ? (
          <Pressable
            onPress={() => {
              hapticLight();
              onRemove();
            }}
            accessibilityRole="button"
            style={styles.row}
          >
            <Text variant="bodyMedium" color={colors.priorityHigh} style={styles.rowLabel}>
              Take off {planDayLabel(currentDay, today).toLowerCase()}
            </Text>
          </Pressable>
        ) : null}
      </SheetBottom>
    </FadeSheet>
  );
}

function DayRow({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.row, selected && styles.rowOn]}
    >
      {icon ? <Ionicons name={icon} size={18} color={colors.inkSoft} /> : null}
      <Text variant="bodyMedium" style={styles.rowLabel}>
        {label}
      </Text>
      {selected ? <Ionicons name="checkmark" size={18} color={colors.brandDeep} /> : null}
    </Pressable>
  );
}

// Same surface as the planner's sheets.
const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sheetWide: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: radii.lg,
    ...shadows.floating,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerTitle: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  rowOn: { backgroundColor: colors.brandSoft },
  rowLabel: { flex: 1 },
});
