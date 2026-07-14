import { useEffect, useState } from 'react';

import ConfettiBurst from '@/components/ConfettiBurst';
import { registerCelebrate } from '@/lib/celebrate';

/**
 * Native celebration overlay. Skia is linked into the binary, so we render the
 * confetti component directly. (Celebration.web loads it through WithSkiaWeb.)
 */
export function Celebration() {
  const [burst, setBurst] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    registerCelebrate(() => {
      setBurst((b) => b + 1);
      setPlaying(true);
    });
    return () => registerCelebrate(null);
  }, []);

  if (!playing) return null;
  return <ConfettiBurst key={burst} onEnd={() => setPlaying(false)} />;
}
