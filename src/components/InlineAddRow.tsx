import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { hapticLight } from '@/lib/haptics';
import { colors, spacing, type as typeScale } from '@/theme/tokens';

/**
 * A short, quiet seam between rows that opens a text box in place.
 *
 * Closed it is barely there — a small + in the row gutter and a hairline — so
 * it reads as a gap you can write in rather than another control. Tapping it
 * puts the cursor exactly where you are looking, which beats reaching for the
 * bottom of the screen and losing your spot.
 *
 * It stays open after each line so you can empty your head in one go, and
 * closes itself when you leave it empty.
 */
export function InlineAddRow({
  placeholder,
  label,
  open,
  onOpenChange,
  onSubmit,
}: {
  /** Shown in the open text box. */
  placeholder: string;
  /** What tapping the closed seam announces, e.g. "Add a line here". */
  label: string;
  /**
   * Held by the parent: adding a line moves this seam to a different row, which
   * remounts it. Owning the flag up there is what keeps the box open and the
   * keyboard up so you can write the next one.
   */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function submit() {
    const text = draft.replace(/\s+/g, ' ').trim();
    if (!text) {
      onOpenChange(false);
      return;
    }
    setDraft('');
    onSubmit(text);
  }

  if (!open) {
    return (
      <Pressable
        onPress={() => {
          hapticLight();
          onOpenChange(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.seam}
      >
        <View style={styles.gutter}>
          <Ionicons name="add" size={16} color={colors.inkFaint} />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.open}>
      <View style={styles.gutter}>
        <Ionicons name="add" size={16} color={colors.inkSoft} />
      </View>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={submit}
        onBlur={() => {
          if (!draft.trim()) onOpenChange(false);
        }}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        returnKeyType="done"
        // Keep the keyboard up between lines.
        blurOnSubmit={false}
        autoFocus
        style={styles.input}
        accessibilityLabel={placeholder}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Short, and just the +: no rule across the row, so it reads as a place to
  // write rather than a line dividing the day in two.
  seam: { height: 28, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm },
  open: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  // 44pt, so the + lines up with the checkboxes above it.
  gutter: { width: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 44,
    paddingRight: spacing.lg,
    color: colors.ink,
    ...typeScale.body,
  },
});
