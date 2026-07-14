import confetti from 'canvas-confetti';
import { useEffect } from 'react';

import { registerCelebrate } from '@/lib/celebrate';
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
 * Web celebration. react-native-fast-confetti's Skia renderer is unreliable in
 * the browser, so on web we use canvas-confetti (DOM canvas, no WASM). Native
 * keeps react-native-fast-confetti (see Celebration.tsx). canvas-confetti mounts
 * and cleans up its own canvas, so this component renders nothing.
 */
function fireConfetti() {
  const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, zIndex: 9999, ticks: 220 };
  confetti({ ...base, particleCount: 120, spread: 75, startVelocity: 45, origin: { x: 0.5, y: 0.75 } });
  confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.85 } });
  confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.85 } });
}

export function Celebration() {
  useEffect(() => {
    registerCelebrate(fireConfetti);
    return () => registerCelebrate(null);
  }, []);
  return null;
}
