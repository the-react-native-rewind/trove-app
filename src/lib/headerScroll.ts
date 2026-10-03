export type HeaderScroll = {
  y: number;
  previousY: number;
  hidden: boolean;
  headerHeight: number;
};

/**
 * Whether a list header should hide or show after a scroll tick.
 * Null means leave it where it is. The thresholds ignore rubber-band noise
 * and tiny jitters so the header only moves on a deliberate flick.
 */
export function headerHiddenAfterScroll(state: HeaderScroll): boolean | null {
  'worklet';
  const { y, previousY, hidden, headerHeight } = state;
  if (headerHeight <= 0) return null;
  // At the top, including a pull-to-refresh bounce, the header stays visible.
  if (y <= 4) return hidden ? false : null;

  const diff = y - previousY;
  if (diff > 8 && !hidden && y > 16) return true;
  if (diff < -8 && hidden) return false;
  return null;
}
