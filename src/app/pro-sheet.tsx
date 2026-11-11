import { useLocalSearchParams } from 'expo-router';

import { ProSheet } from '@/components/ProSheet';

/**
 * Route wrapper so screens that aren't themselves modals (the Today tab) can
 * present the Pro bottom sheet: router.push('/pro-sheet?title=…&body=…').
 */
export default function ProSheetRoute() {
  const { title, body } = useLocalSearchParams<{ title?: string; body?: string }>();
  return (
    <ProSheet
      title={title ?? 'Trove Pro'}
      body={body ?? 'This is part of Trove Pro.'}
    />
  );
}
