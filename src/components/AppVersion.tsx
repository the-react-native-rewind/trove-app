import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { getRunningBundle, type RunningBundle } from '@/lib/codePush';
import { colors, spacing } from '@/theme/tokens';

// Shows which JavaScript bundle is running: the one inside the App Store /
// TestFlight binary, or a CodePush release (v1, v2, ...) and its description.
export function AppVersion() {
  const [bundle, setBundle] = useState<RunningBundle | null>(null);

  useEffect(() => {
    getRunningBundle()
      .then(setBundle)
      .catch(() => setBundle({ label: null, description: null }));
  }, []);

  const version = Constants.expoConfig?.version ?? '';
  const source = bundle === null ? '' : bundle.label ? `CodePush ${bundle.label}` : 'store bundle';

  return (
    <View style={styles.wrap}>
      <Text variant="meta" color={colors.inkFaint} center>
        {`Trove ${version}${source ? ` · ${source}` : ''}`}
      </Text>
      {bundle?.description ? (
        <Text variant="meta" color={colors.inkFaint} center>
          {bundle.description}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl, alignItems: 'center', gap: spacing.xs },
});
