import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { hapticLight } from '@/lib/haptics';
import {
  WEEKDAY_ORDER,
  type OnboardingAction,
  type OnboardingRoutine,
  type Weekday,
} from '@/lib/onboarding';
import { WEEKDAY_PICKER_ORDER, WEEKDAY_SHORT } from '@/lib/today';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

/** One editable action: title, a toggle for the planned day, and a remove button. */
export function ActionRow({
  action,
  dayLabel = 'Today',
  onChangeTitle,
  onToggleToday,
  onRemove,
}: {
  action: OnboardingAction;
  /** The day being planned: Today, or Tomorrow in the evening. */
  dayLabel?: string;
  onChangeTitle: (title: string) => void;
  /** Leave out to hide the day toggle, where the day is not being chosen. */
  onToggleToday?: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.bullet} />
      <TextInput
        value={action.title}
        onChangeText={onChangeTitle}
        placeholder="Action"
        placeholderTextColor={colors.inkFaint}
        style={styles.input}
        multiline
      />
      {onToggleToday ? (
        <Pressable
          onPress={onToggleToday}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ selected: action.today }}
          accessibilityLabel={
            action.today ? `On ${dayLabel.toLowerCase()}` : `Add to ${dayLabel.toLowerCase()}`
          }
          style={[styles.chip, action.today && styles.chipOn]}
        >
          <Text variant="meta" color={action.today ? colors.onBrand : colors.inkSoft}>
            {dayLabel}
          </Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
        <Ionicons name="close" size={18} color={colors.inkFaint} />
      </Pressable>
    </View>
  );
}

/** One editable routine: text, the days it falls on, and a remove button. */
export function RoutineRow({
  routine,
  onChangeText,
  onChangeDays,
  onRemove,
}: {
  routine: OnboardingRoutine;
  onChangeText: (text: string) => void;
  onChangeDays: (days: Weekday[]) => void;
  onRemove: () => void;
}) {
  // No days listed means every day.
  const on = routine.days.length === 0 ? WEEKDAY_ORDER : routine.days;

  function toggle(day: Weekday) {
    const next = on.includes(day) ? on.filter((d) => d !== day) : [...on, day];
    if (next.length === 0) return; // a routine has to fall on at least one day
    hapticLight();
    onChangeDays(WEEKDAY_ORDER.filter((d) => next.includes(d)));
  }

  return (
    <View style={styles.routine}>
      <View style={styles.row}>
        <Ionicons name="repeat" size={16} color={colors.inkFaint} />
        <TextInput
          value={routine.text}
          onChangeText={onChangeText}
          placeholder="Routine"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          multiline
        />
        <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
          <Ionicons name="close" size={18} color={colors.inkFaint} />
        </Pressable>
      </View>
      <View style={styles.days}>
        {WEEKDAY_PICKER_ORDER.map((index) => {
          const day = WEEKDAY_ORDER[index];
          const selected = on.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggle(day)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={WEEKDAY_SHORT[index]}
              style={[styles.day, selected && styles.dayOn]}
            >
              <Text variant="meta" color={selected ? colors.brandDeep : colors.inkFaint}>
                {WEEKDAY_SHORT[index].charAt(0)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  bullet: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.inkFaint,
  },
  routine: { paddingVertical: spacing.xs, gap: spacing.xs },
  days: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 16 + spacing.sm },
  day: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  dayOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoft },
  input: {
    flex: 1,
    fontFamily: fonts.bodyRegular,
    fontSize: 15.5,
    color: colors.ink,
    padding: 0,
  },
  chip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
});
