import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Attachment } from '@/data/attachments';
import { colors, radii, spacing } from '@/theme/tokens';

/**
 * Full-bleed media keeps the card's top radius and a square bottom edge.
 * The clip and the image or video both use this so a rounded bottom cannot
 * show through when a parent fails to clip.
 */
export const fullBleedMediaCorners = {
  borderTopLeftRadius: radii.card,
  borderTopRightRadius: radii.card,
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
} as const;

const CARD_MAX_HEIGHT = 220;
const CARD_RATIO = 0.62;

/**
 * Full-bleed photos and videos. Several items page sideways with dots.
 * Images stay lazy and cached. Videos show a poster until they are opened,
 * so a long list does not mount a player per card.
 */
export function TaskMediaStrip({
  items,
  maxHeight = CARD_MAX_HEIGHT,
}: {
  items: Attachment[];
  maxHeight?: number;
}) {
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const height =
    width > 0 ? Math.min(maxHeight, Math.max(148, Math.round(width * CARD_RATIO))) : 176;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    setPage((prev) => (prev === next ? prev : next));
  }

  return (
    <View
      style={[styles.frame, fullBleedMediaCorners, { height }]}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        setWidth((prev) => (prev === next ? prev : next));
      }}
    >
      {width > 0 ? (
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          bounces={items.length > 1}
          scrollEnabled={items.length > 1}
          directionalLockEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onScroll={onScroll}
          scrollEventThrottle={32}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => setOpenIndex(index)}
              accessibilityRole="button"
              accessibilityLabel={
                item.media_type === 'video'
                  ? `Play video ${index + 1} of ${items.length}`
                  : `View photo ${index + 1} of ${items.length}`
              }
              style={[styles.page, fullBleedMediaCorners, { width, height }]}
            >
              <MediaFrame item={item} index={index} />
            </Pressable>
          )}
        />
      ) : null}
      {items.length > 1 ? (
        <View pointerEvents="none" style={styles.dots}>
          {items.map((item, index) => (
            <View key={item.id} style={[styles.dot, index === page && styles.dotActive]} />
          ))}
        </View>
      ) : null}
      {openIndex != null ? (
        <MediaViewer items={items} initialIndex={openIndex} onClose={() => setOpenIndex(null)} />
      ) : null}
    </View>
  );
}

function MediaFrame({ item, index }: { item: Attachment; index: number }) {
  if (item.media_type === 'video' || !item.url) {
    return (
      <View style={[styles.poster, styles.clipped, fullBleedMediaCorners]}>
        <View style={styles.play}>
          <Ionicons name="play" size={22} color={colors.ink} />
        </View>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: item.url }}
      style={[styles.media, fullBleedMediaCorners]}
      contentFit="cover"
      cachePolicy="memory-disk"
      recyclingKey={item.id}
      priority={index === 0 ? 'normal' : 'low'}
      loading={index === 0 ? 'eager' : 'lazy'}
      transition={120}
      accessibilityLabel="Task photo"
    />
  );
}

export function MediaViewer({
  items,
  initialIndex,
  onClose,
}: {
  items: Attachment[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [page, setPage] = useState(initialIndex);

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.viewer}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          initialScrollIndex={Math.min(initialIndex, items.length - 1)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          onMomentumScrollEnd={(event) => {
            if (width <= 0) return;
            setPage(Math.round(event.nativeEvent.contentOffset.x / width));
          }}
          renderItem={({ item, index }) => (
            <View style={{ width, height, justifyContent: 'center' }}>
              {item.media_type === 'video' ? (
                index === page && item.url ? (
                  <ViewerVideo url={item.url} />
                ) : (
                  <View style={styles.poster}>
                    <View style={styles.play}>
                      <Ionicons name="play" size={28} color={colors.ink} />
                    </View>
                  </View>
                )
              ) : item.url ? (
                <Image
                  source={{ uri: item.url }}
                  style={{ width, height }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  recyclingKey={item.id}
                  accessibilityLabel="Task photo"
                />
              ) : null}
            </View>
          )}
        />
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          style={[styles.close, { top: insets.top + spacing.sm }]}
        >
          <Ionicons name="close" size={26} color={colors.onBrand} />
        </Pressable>
        {items.length > 1 ? (
          <View pointerEvents="none" style={[styles.dots, { bottom: insets.bottom + spacing.lg }]}>
            {items.map((item, index) => (
              <View key={item.id} style={[styles.dot, index === page && styles.dotActive]} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function ViewerVideo({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return <VideoView style={styles.video} player={player} nativeControls contentFit="contain" />;
}

const styles = StyleSheet.create({
  frame: { width: '100%', backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  page: { overflow: 'hidden' },
  clipped: { overflow: 'hidden' },
  media: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
  },
  poster: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2B2620',
  },
  play: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(251, 246, 236, 0.55)',
  },
  dotActive: { backgroundColor: colors.surface, width: 7, height: 7, borderRadius: 4 },
  viewer: { flex: 1, backgroundColor: '#1A1612' },
  close: {
    position: 'absolute',
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(43, 38, 32, 0.55)',
  },
  video: { width: '100%', height: '70%' },
});
