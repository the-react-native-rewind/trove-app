import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useRoster } from '@/data/members';
import { formatDueDate, toDateString } from '@/lib/format';
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
  return (
    <View style={styles.field}>
      <FieldLabel>Accent colour</FieldLabel>
      <View style={styles.swatchRow}>
        {spaceAccentOrder.map((name) => {
          const hex = spaceAccents[name];
          const selected = resolveAccent(value) === hex;
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
      </View>
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
      <FieldLabel>Space</FieldLabel>
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

      {show ? (
        <DateTimePicker
          value={value ? new Date(`${value}T00:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant="light"
          accentColor={colors.brand}
          onChange={(event, date) => {
            if (Platform.OS !== 'ios') setShow(false);
            if (event.type === 'set' && date) onChange(toDateString(date));
          }}
        />
      ) : null}
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
});
