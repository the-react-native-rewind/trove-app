import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Toast from 'react-native-toast-message';

import { useDismissInboxItem, useInbox, useSendInboxItemToToday } from '@/data/inbox';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { sourceLabel, type InboxItem } from '@/lib/inbox';
import { colors, spacing } from '@/theme/tokens';
import { Text } from './ui/Text';

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * The Inbox, embedded at the top of today. Step zero of the day: process what's
 * arrived, then work your plan below it. Styled to sit in the Today list, not as
 * a separate card — flat rows, hairline dividers, the same plain icon buttons.
 *
 * Collapsed by default and only rendered when something is waiting. Triage only:
 * send a line to Trove as an action, or dismiss it. No completing here.
 */
export function InboxSection() {
  const router = useRouter();
  const { data: items = [] } = useInbox();
  const dismiss = useDismissInboxItem();
  const sendToToday = useSendInboxItemToToday();
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  function accept(item: InboxItem) {
    hapticMedium();
    const params = new URLSearchParams({ inboxId: item.id, text: item.text });
    router.push(`/task-new?${params.toString()}` as never);
  }

  function decline(item: InboxItem) {
    hapticLight();
    dismiss.mutate(item.id, {
      onError: (error) =>
        Toast.show({ type: 'error', text1: 'Couldn’t dismiss that', text2: messageOf(error) }),
    });
  }

  function addToToday(item: InboxItem) {
    hapticMedium();
    sendToToday.mutate(item, {
      onError: (error) =>
        Toast.show({ type: 'error', text1: 'Couldn’t add to today', text2: messageOf(error) }),
    });
  }

  return (
    <View>
      <Pressable
        onPress={() => {
          hapticLight();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`Inbox, ${items.length} waiting`}
        style={styles.headerRow}
      >
        <View style={styles.gutter}>
          <Ionicons
            name={open ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color={colors.inkFaint}
          />
        </View>
        <Text variant="label" color={colors.inkFaint} style={styles.headerLabel}>
          Inbox
        </Text>
        <Text variant="meta" color={colors.inkFaint} style={styles.headerCount}>
          {items.length}
        </Text>
      </Pressable>

      {open
        ? items.map((item) => {
            const tag = sourceLabel(item.source);
            return (
              <Animated.View key={item.id} entering={FadeIn.duration(160)} style={styles.row}>
                <View style={styles.gutter} />
                <View style={styles.rowBody}>
                  <Text variant="body" color={colors.ink} numberOfLines={3}>
                    {item.text}
                  </Text>
                  {tag ? (
                    <View style={styles.metaRow}>
                      <Ionicons name="sparkles-outline" size={12} color={colors.inkFaint} />
                      <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                        {tag}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => addToToday(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${item.text} to today`}
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <Ionicons name="arrow-down" size={18} color={colors.inkFaint} />
                </Pressable>
                <Pressable
                  onPress={() => accept(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${item.text} to Trove as an action`}
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.inkFaint} />
                </Pressable>
                <Pressable
                  onPress={() => decline(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${item.text}`}
                  hitSlop={6}
                  style={styles.iconBtn}
                >
                  <Ionicons name="close" size={18} color={colors.inkFaint} />
                </Pressable>
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

// Mirrors TodayView's line rows: flat, hairline divider, 44pt left gutter so
// text lines up with the day's lines, and plain icon buttons (no fills).
const styles = StyleSheet.create({
  headerRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
  },
  headerLabel: { flex: 1 },
  headerCount: { paddingHorizontal: spacing.md },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    backgroundColor: colors.paper,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  gutter: { width: 44, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, paddingVertical: spacing.sm, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
});
