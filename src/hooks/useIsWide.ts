import { useWindowDimensions } from 'react-native';

/** Wide = roomy enough for a permanent sidebar + multi-column Kanban. */
export const WIDE_BREAKPOINT = 900;

export function useIsWide() {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
}
