import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useRoster } from '@/data/members';
import { formatDueDate } from '@/lib/format';
import {
  defaultWeekday,
  nextRecurrenceDate,
  repeatChoice,
  repeatRuleFromTask,
  repeatScheduleCopy,
  WEEKDAY_CHOICES,
  type RepeatChoice,
  type RepeatRule,
  type RepeatUnit,
} from '@/lib/recurrence';
import { DateSpinner } from './DateSpinner';
import type { SpaceWithMeta } from '@/lib/types';
import { canWrite } from '@/lib/types';
import { colors, radii, resolveAccent, spaceAccentOrder, spaceAccents, spacing } from '@/theme/tokens';
import { Avatar } from './ui/Avatar';
import { AccentDot } from './ui/Indicators';
import { Text } from './ui/Text';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text variant="label" color={colors.inkSoft} style={styles.label}>
      {children}
    </Text>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const resolved = resolveAccent(value);
  const presetHexes = spaceAccentOrder.map((n) => spaceAccents[n].toLowerCase());
  const isCustom = !presetHexes.includes(resolved.toLowerCase());

  return (
    <View style={styles.field}>
      <FieldLabel>Accent colour</FieldLabel>
      <View style={styles.swatchRow}>
        {spaceAccentOrder.map((name) => {
          const hex = spaceAccents[name];
          const selected = resolved.toLowerCase() === hex.toLowerCase();
          return (
            <Pressable
              key={name}
              onPress={() => onChange(name)}
              accessibilityRole="button"
              accessibilityLabel={`${name} accent`}
              accessibilityState={{ selected }}
              style={[styles.swatch, { backgroundColor: hex }, selected && styles.swatchSelected]}
            >
              {selected ? <Ionicons name="checkmark" size={18} color={colors.white} /> : null}
            </Pressable>
          );
        })}
        <CustomColorSwatch
          value={isCustom ? resolved : '#4C6444'}
          selected={isCustom}
          onChange={onChange}
        />
      </View>
    </View>
  );
}

/**
 * Free-form colour picker. On web it uses the native `<input type="color">`;
 * on native it isn't rendered (only the presets show).
 */
function CustomColorSwatch({
  value,
  selected,
  onChange,
}: {
  value: string;
  selected: boolean;
  onChange: (color: string) => void;
}) {
  if (Platform.OS !== 'web') return null;

  return (
    <View
      style={[
        styles.swatch,
        styles.customSwatch,
        selected && { backgroundColor: value, borderColor: colors.ink },
      ]}
    >
      {selected ? (
        <Ionicons name="checkmark" size={18} color={colors.white} />
      ) : (
        <Ionicons name="color-palette-outline" size={18} color={colors.inkSoft} />
      )}
      {/* Transparent native colour input overlaid so the whole swatch is clickable. */}
      <input
        type="color"
        aria-label="Custom accent colour"
        value={value}
        onChange={(e: { target: { value: string } }) => onChange(e.target.value)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0,
          cursor: 'pointer',
          border: 'none',
          padding: 0,
        }}
      />
    </View>
  );
}

type Option<T extends string> = { value: T; label: string; color?: string };

export function OptionChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.chipRow}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
            >
              {opt.color ? <AccentDot color={opt.color} size={9} /> : null}
              <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Pick a circle. Unlike SpacePicker, this includes circles the person can only view. */
export function CirclePicker({
  circles,
  value,
  onChange,
  label = 'Circle',
}: {
  circles: { id: string; name: string; color: string }[];
  value: string | null;
  onChange: (circleId: string) => void;
  label?: string;
}) {
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.chipRow}>
        {circles.map((circle) => {
          const selected = circle.id === value;
          return (
            <Pressable
              key={circle.id}
              onPress={() => onChange(circle.id)}
              accessibilityRole="button"
              accessibilityLabel={circle.name}
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
            >
              <AccentDot color={circle.color} size={9} />
              <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                {circle.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SpacePicker({
  spaces,
  value,
  onChange,
}: {
  spaces: SpaceWithMeta[];
  value: string | null;
  onChange: (spaceId: string) => void;
}) {
  const writableSpaces = spaces.filter((s) => canWrite(s.role));
  return (
    <View style={styles.field}>
      <FieldLabel>Circle</FieldLabel>
      <View style={styles.chipRow}>
        {writableSpaces.map((s) => {
          const selected = s.id === value;
          return (
            <Pressable
              key={s.id}
              onPress={() => onChange(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
            >
              <AccentDot color={s.color} size={9} />
              <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                {s.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function AssigneePicker({
  spaceId,
  value,
  onChange,
}: {
  spaceId: string | null;
  value: string | null;
  onChange: (userId: string | null) => void;
}) {
  const { data: roster = [] } = useRoster(spaceId ?? 'all');
  return (
    <View style={styles.field}>
      <FieldLabel>Assignee</FieldLabel>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: value === null }}
          style={[styles.chip, value === null ? styles.chipSelected : styles.chipIdle]}
        >
          <Text variant="bodyMedium" color={value === null ? colors.onBrand : colors.inkSoft}>
            Unassigned
          </Text>
        </Pressable>
        {roster.map((m) => {
          if (!m.profile) return null;
          const selected = m.user_id === value;
          return (
            <Pressable
              key={m.id}
              onPress={() => onChange(m.user_id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
            >
              <Avatar name={m.profile.display_name} uri={m.profile.avatar_url} size={20} />
              <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                {m.profile.display_name ?? 'Member'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const REPEAT_CHOICES: { value: RepeatChoice; label: string }[] = [
  { value: 'never', label: 'Never' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom' },
];

const CUSTOM_UNITS: { value: RepeatUnit; label: string }[] = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

export function RepeatPicker({
  task,
  finished,
  onChange,
}: {
  task: {
    repeat_unit?: string | null;
    repeat_interval?: number | null;
    repeat_weekday?: number | null;
    due_date: string | null;
  };
  /** This occurrence is already done. Editing its rule does not rewrite the next one. */
  finished?: boolean;
  onChange: (rule: RepeatRule) => void;
}) {
  const rule = repeatRuleFromTask(task);
  const choice = repeatChoice(rule);
  const showWeekday = rule.unit === 'week';
  const nextLabel = task.due_date
    ? formatDueDate(nextRecurrenceDate(task.due_date, rule))
    : null;
  const summary = repeatScheduleCopy(rule, nextLabel, task.due_date != null);

  function choose(next: RepeatChoice) {
    if (next === 'never') {
      onChange({ unit: null, interval: 1, weekday: null });
      return;
    }
    if (next === 'daily') {
      onChange({ unit: 'day', interval: 1, weekday: null });
      return;
    }
    if (next === 'weekly') {
      onChange({
        unit: 'week',
        interval: 1,
        weekday: rule.unit === 'week' && rule.weekday != null ? rule.weekday : defaultWeekday(task.due_date),
      });
      return;
    }
    if (next === 'monthly') {
      onChange({ unit: 'month', interval: 1, weekday: null });
      return;
    }
    if (choice === 'custom') return;
    const unit = rule.unit ?? 'day';
    onChange({
      unit,
      interval: 2,
      weekday: unit === 'week' ? (rule.weekday ?? defaultWeekday(task.due_date)) : null,
    });
  }

  function setUnit(unit: RepeatUnit) {
    onChange({
      unit,
      interval: rule.interval,
      weekday: unit === 'week' ? (rule.weekday ?? defaultWeekday(task.due_date)) : null,
    });
  }

  return (
    <View style={styles.field}>
      <OptionChips label="Repeat" options={REPEAT_CHOICES} value={choice} onChange={choose} />
      {choice === 'custom' ? (
        <View style={styles.field}>
          <FieldLabel>Every</FieldLabel>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => {
                if (rule.interval <= 1) return;
                onChange({ ...rule, interval: rule.interval - 1 });
              }}
              accessibilityRole="button"
              accessibilityLabel="Decrease interval"
              accessibilityState={{ disabled: rule.interval <= 1 }}
              style={[styles.stepperButton, rule.interval <= 1 && styles.stepperButtonDisabled]}
            >
              <Ionicons name="remove" size={18} color={colors.brandDeep} />
            </Pressable>
            <Text variant="bodyMedium" style={styles.stepperValue}>
              {rule.interval}
            </Text>
            <Pressable
              onPress={() => {
                if (rule.interval >= 99) return;
                onChange({ ...rule, interval: rule.interval + 1 });
              }}
              accessibilityRole="button"
              accessibilityLabel="Increase interval"
              accessibilityState={{ disabled: rule.interval >= 99 }}
              style={[styles.stepperButton, rule.interval >= 99 && styles.stepperButtonDisabled]}
            >
              <Ionicons name="add" size={18} color={colors.brandDeep} />
            </Pressable>
          </View>
          <View style={styles.chipRow}>
            {CUSTOM_UNITS.map((unit) => {
              const selected = rule.unit === unit.value;
              return (
                <Pressable
                  key={unit.value}
                  onPress={() => setUnit(unit.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                >
                  <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                    {unit.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {showWeekday ? (
        <View style={styles.field}>
          <FieldLabel>On</FieldLabel>
          <View style={styles.chipRow}>
            {WEEKDAY_CHOICES.map((day) => {
              const selected = rule.weekday === day.value;
              return (
                <Pressable
                  key={day.name}
                  onPress={() => onChange({ ...rule, weekday: day.value })}
                  accessibilityRole="button"
                  accessibilityLabel={day.name}
                  accessibilityState={{ selected }}
                  style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
                >
                  <Text variant="bodyMedium" color={selected ? colors.onBrand : colors.inkSoft}>
                    {day.short}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
      {summary ? (
        <Text variant="meta" color={colors.inkSoft}>
          {summary}
        </Text>
      ) : null}
      {finished && rule.unit ? (
        <Text variant="meta" color={colors.inkFaint}>
          This occurrence is finished. The next one keeps its own repeat rule.
        </Text>
      ) : null}
    </View>
  );
}

export function DueDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (date: string | null) => void;
}) {
  const [show, setShow] = useState(false);
  const label = formatDueDate(value) ?? 'No date';

  return (
    <View style={styles.field}>
      <FieldLabel>Due date</FieldLabel>
      <View style={styles.dueRow}>
        <Pressable
          onPress={() => setShow((v) => !v)}
          accessibilityRole="button"
          style={[styles.chip, value ? styles.chipSelected : styles.chipIdle]}
        >
          <Ionicons
            name="calendar-outline"
            size={16}
            color={value ? colors.onBrand : colors.inkSoft}
          />
          <Text variant="bodyMedium" color={value ? colors.onBrand : colors.inkSoft}>
            {label}
          </Text>
        </Pressable>
        {value ? (
          <Pressable onPress={() => onChange(null)} hitSlop={8} accessibilityLabel="Clear date">
            <Text variant="meta" color={colors.priorityHigh}>
              Clear
            </Text>
          </Pressable>
        ) : null}
      </View>

      <DateSpinner
        visible={show}
        value={value}
        onChange={onChange}
        onClose={() => setShow(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { marginLeft: 2 },
  swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  swatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchSelected: { borderColor: colors.ink },
  customSwatch: {
    backgroundColor: colors.surface,
    borderColor: colors.hairline,
    borderStyle: 'dashed',
    overflow: 'hidden',
    position: 'relative',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.hairline },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperValue: { minWidth: 24, textAlign: 'center' },
});
