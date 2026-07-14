import { StyleSheet, View } from 'react-native';
import { Confetti } from 'react-native-fast-confetti';

import { spaceAccents } from '@/theme/tokens';

const CONFETTI_COLORS = [
  spaceAccents.brand,
  spaceAccents.honey,
  spaceAccents.plum,
  spaceAccents.ochre,
  spaceAccents.terracotta,
  spaceAccents.sage,
];

/**
 * One-shot confetti burst. Imports Skia (via react-native-fast-confetti), so on
 * web it must only be loaded once CanvasKit is ready — that's why Celebration.web
 * pulls it in through WithSkiaWeb rather than a static import.
 */
export default function ConfettiBurst({ onEnd }: { onEnd: () => void }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Confetti
        autoplay
        infinite={false}
        fadeOutOnEnd
        count={180}
        colors={CONFETTI_COLORS}
        onAnimationEnd={onEnd}
      />
    </View>
  );
}
