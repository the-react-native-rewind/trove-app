import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { summariseDays, type OnboardingAction, type OnboardingRoutine } from '@/lib/onboarding';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

/** One editable action: title, a Today toggle, and a remove button. */
export function ActionRow({
  action,
  onChangeTitle,
  onToggleToday,
  onRemove,
}: {
  action: OnboardingAction;
  onChangeTitle: (title: string) => void;
  onToggleToday: () => void;
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
      <Pressable
        onPress={onToggleToday}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ selected: action.today }}
        accessibilityLabel={action.today ? 'On today' : 'Add to today'}
        style={[styles.chip, action.today && styles.chipOn]}
      >
        <Text variant="meta" color={action.today ? colors.onBrand : colors.inkSoft}>
          Today
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
        <Ionicons name="close" size={18} color={colors.inkFaint} />
      </Pressable>
    </View>
  );
}

/** One editable routine: text, its cadence, and a remove button. */
export function RoutineRow({
  routine,
  onChangeText,
  onRemove,
}: {
  routine: OnboardingRoutine;
  onChangeText: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name="repeat" size={16} color={colors.inkFaint} style={styles.repeatIcon} />
      <View style={styles.routineBody}>
        <TextInput
          value={routine.text}
          onChangeText={onChangeText}
          placeholder="Routine"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          multiline
        />
        <Text variant="meta" color={colors.inkFaint}>
          {summariseDays(routine.days)}
        </Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove">
        <Ionicons name="close" size={18} color={colors.inkFaint} />
      </Pressable>
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
  repeatIcon: { marginTop: 2 },
  routineBody: { flex: 1 },
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
