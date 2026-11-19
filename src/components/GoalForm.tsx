import { Pressable, StyleSheet, View } from 'react-native';

import {
  GOAL_NUMBER_FORMATS,
  GOAL_OUTCOME_MAX,
  GOAL_TITLE_MAX,
  GOAL_UNIT_LABEL,
  GOAL_UNIT_PLACEHOLDER,
  formatGoalAmount,
  type GoalNumberFormat,
  type GoalResultKind,
} from '@/lib/goals';
import { hapticSelection } from '@/lib/haptics';
import { colors, radii, spacing } from '@/theme/tokens';
import { Text } from './ui/Text';
import { TextField } from './ui/TextField';

export type GoalFormState = {
  title: string;
  description: string;
  resultKind: GoalResultKind;
  outcome: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  numberFormat: GoalNumberFormat;
};

export const EMPTY_GOAL_FORM: GoalFormState = {
  title: '',
  description: '',
  resultKind: 'outcome',
  outcome: '',
  targetValue: '',
  currentValue: '',
  unit: '',
  numberFormat: 'plain',
};

/**
 * Writing a goal down. The two result kinds are the heart of it: the form
 * makes you pick one and then insists on filling it in, because a goal with no
 * result is the kind you quietly drop in three weeks.
 */
export function GoalForm({
  value,
  onChange,
  error,
}: {
  value: GoalFormState;
  onChange: (next: GoalFormState) => void;
  error: string | null;
}) {
  function set<K extends keyof GoalFormState>(key: K, next: GoalFormState[K]) {
    onChange({ ...value, [key]: next });
  }

  const counted = value.resultKind === 'number';

  return (
    <View style={styles.form}>
      <TextField
        label="Goal"
        value={value.title}
        onChangeText={(next) => set('title', next)}
        placeholder="Make Trove pay for itself"
        maxLength={GOAL_TITLE_MAX}
        accessibilityLabel="Goal name"
      />

      <TextField
        label="Why it matters"
        helper="Optional. The reason you will still care in March."
        value={value.description}
        onChangeText={(next) => set('description', next)}
        placeholder="So I can work on it full time instead of squeezing it into evenings."
        multiline
        numberOfLines={3}
        style={styles.multiline}
        accessibilityLabel="Why this goal matters"
      />

      <View style={styles.kind}>
        <Text variant="label" color={colors.inkSoft}>
          How you will know
        </Text>
        <View style={styles.kindRow}>
          <KindChip
            label="A result"
            detail="Something that is either true or it is not"
            selected={!counted}
            onPress={() => set('resultKind', 'outcome')}
          />
          <KindChip
            label="A number"
            detail="A figure to reach"
            selected={counted}
            onPress={() => set('resultKind', 'number')}
          />
        </View>
      </View>

      {counted ? (
        <View style={styles.numbers}>
          <View style={styles.numberField}>
            <TextField
              label="Target"
              value={value.targetValue}
              onChangeText={(next) => set('targetValue', next)}
              placeholder="100"
              keyboardType="decimal-pad"
              accessibilityLabel="Target number"
            />
          </View>
          <View style={styles.numberField}>
            <TextField
              label="Where you are"
              value={value.currentValue}
              onChangeText={(next) => set('currentValue', next)}
              placeholder="0"
              keyboardType="decimal-pad"
              accessibilityLabel="Current number"
            />
          </View>
        </View>
      ) : (
        <TextField
          label="The result"
          helper="Write it as though it has already happened."
          value={value.outcome}
          onChangeText={(next) => set('outcome', next)}
          placeholder="Trove has 100 people paying for Pro"
          maxLength={GOAL_OUTCOME_MAX}
          multiline
          numberOfLines={2}
          style={styles.multiline}
          accessibilityLabel="The result"
        />
      )}

      {counted ? (
        <View style={styles.kind}>
          <Text variant="label" color={colors.inkSoft}>
            How it reads
          </Text>
          <View style={styles.kindRow}>
            {GOAL_NUMBER_FORMATS.map((format) => (
              <FormatChip
                key={format}
                label={FORMAT_LABEL[format]}
                example={formatGoalAmount(
                  4000,
                  format,
                  format === 'currency' ? value.unit || '£' : value.unit,
                )}
                selected={value.numberFormat === format}
                onPress={() => set('numberFormat', format)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {counted && value.numberFormat !== 'percent' ? (
        <TextField
          label={GOAL_UNIT_LABEL[value.numberFormat]}
          helper={
            value.numberFormat === 'currency'
              ? 'The symbol to put in front of the figure.'
              : 'Optional. Shown after the number.'
          }
          value={value.unit}
          onChangeText={(next) => set('unit', next)}
          placeholder={GOAL_UNIT_PLACEHOLDER[value.numberFormat]}
          accessibilityLabel={GOAL_UNIT_LABEL[value.numberFormat]}
        />
      ) : null}

      {error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const FORMAT_LABEL: Record<GoalNumberFormat, string> = {
  plain: 'Plain',
  currency: 'Currency',
  percent: 'Percent',
};

/** A format, shown with what 4000 would look like under it. */
function FormatChip({
  label,
  example,
  selected,
  onPress,
}: {
  label: string;
  example: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}, like ${example}`}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text variant="bodyMedium" color={selected ? colors.brandDeep : colors.ink}>
        {label}
      </Text>
      <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
        {example}
      </Text>
    </Pressable>
  );
}

function KindChip({
  label,
  detail,
  selected,
  onPress,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        hapticSelection();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text variant="bodyMedium" color={selected ? colors.brandDeep : colors.ink}>
        {label}
      </Text>
      <Text variant="meta" color={colors.inkFaint}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  kind: { gap: spacing.sm },
  kindRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.button,
    backgroundColor: colors.surfaceAlt,
  },
  chipOn: { backgroundColor: colors.brandSoft },
  numbers: { flexDirection: 'row', gap: spacing.md },
  numberField: { flex: 1 },
});
