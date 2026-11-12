import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useAddInboxItem, useDismissInboxItem, useInbox } from '@/data/inbox';
import { useIsWide } from '@/hooks/useIsWide';
import { hapticLight, hapticMedium } from '@/lib/haptics';
import { normalizeInboxText, sourceLabel, type InboxItem } from '@/lib/inbox';
import { colors, radii, spacing, type as typeScale } from '@/theme/tokens';
import { EmptyState } from './ui/EmptyState';
import { Text } from './ui/Text';

const EMPTY: InboxItem[] = [];

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Try again.';
}

/**
 * The Inbox: a frictionless capture surface and a one-way street into Trove.
 * A line can be accepted (it opens the action sheet, prefilled, and becomes an
 * action in a circle) or dismissed. It is never ticked or completed here — you
 * don't work from your inbox.
 */
export function InboxView() {
  const navigation = useNavigation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWide = useIsWide();

  const { data, isLoading, isError, refetch } = useInbox();
  const items = data ?? EMPTY;
  const add = useAddInboxItem();
  const dismiss = useDismissInboxItem();

  const [draft, setDraft] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  function openDrawer() {
    (navigation as unknown as { openDrawer: () => void }).openDrawer();
  }

  function submitDraft() {
    const text = normalizeInboxText(draft);
    if (!text) return;
    setDraft('');
    hapticMedium();
    add.mutate(text, {
      onError: (error) => {
        setDraft(text);
        Toast.show({ type: 'error', text1: 'Couldn’t capture that', text2: messageOf(error) });
      },
    });
  }

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

  function renderItem({ item, index }: { item: InboxItem; index: number }) {
    const tag = sourceLabel(item.source);
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index, 10) * 24).duration(240)}>
        <View style={styles.row}>
          <View style={styles.rowBody}>
            <Text variant="body" color={colors.ink} numberOfLines={4}>
              {item.text}
            </Text>
            {tag ? (
              <View style={styles.sourceTag}>
                <Ionicons name="sparkles-outline" size={12} color={colors.inkFaint} />
                <Text variant="meta" color={colors.inkFaint} numberOfLines={1}>
                  {tag}
                </Text>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => decline(item)}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${item.text}`}
            hitSlop={8}
            style={styles.dismissBtn}
          >
            <Ionicons name="close" size={20} color={colors.inkFaint} />
          </Pressable>
          <Pressable
            onPress={() => accept(item)}
            accessibilityRole="button"
            accessibilityLabel={`Send ${item.text} to Trove`}
            hitSlop={8}
            style={styles.acceptBtn}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.onBrand} />
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  const empty = isLoading ? null : (
    <EmptyState
      icon={isError ? 'cloud-offline-outline' : 'file-tray-outline'}
      title={isError ? 'Couldn’t load the inbox' : 'Inbox zero'}
      body={
        isError
          ? 'Pull to refresh and try again.'
          : 'Capture anything below. Connected tools drop things here too. Send each one into Trove, or let it go — you don’t work from here.'
      }
    />
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, isWide && styles.headerWide, { paddingTop: insets.top + spacing.sm }]}>
        {!isWide ? (
          <Pressable
            onPress={openDrawer}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Open circles"
            style={styles.iconBtn}
          >
            <Ionicons name="menu" size={26} color={colors.ink} />
          </Pressable>
        ) : null}
        <Text variant="screenTitle" style={styles.title} numberOfLines={1}>
          Inbox
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={
            items.length === 0 ? styles.emptyContent : styles.listContent
          }
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScrollBeginDrag={() => Keyboard.dismiss()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void Promise.all([
                  refetch(),
                  new Promise((resolve) => setTimeout(resolve, 600)),
                ]).finally(() => setRefreshing(false));
              }}
              tintColor={colors.brand}
            />
          }
        />
      )}

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={() => submitDraft()}
          placeholder="Capture a thought…"
          placeholderTextColor={colors.inkFaint}
          returnKeyType="done"
          blurOnSubmit={false}
          style={styles.input}
          accessibilityLabel="Capture a thought"
        />
        <Pressable
          onPress={() => submitDraft()}
          accessibilityRole="button"
          accessibilityLabel="Add to inbox"
          style={styles.addBtn}
        >
          <Ionicons name="add" size={24} color={colors.inkSoft} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerWide: { paddingHorizontal: spacing.xl },
  iconBtn: { padding: spacing.xs },
  title: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 120, gap: spacing.sm },
  emptyContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowBody: { flex: 1, gap: spacing.xs },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dismissBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  acceptBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: 40,
    color: colors.ink,
    ...typeScale.body,
    fontSize: 16,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
