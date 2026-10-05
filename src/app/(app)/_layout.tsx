import { Drawer } from 'expo-router/drawer';
import { StyleSheet, View } from 'react-native';

import { SpacesDrawer } from '@/components/SpacesDrawer';
import { useIsWide } from '@/hooks/useIsWide';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  const isWide = useIsWide();
  return (
    // Clip the closed phone drawer. react-native-drawer-layout parks it at
    // left: -300px, which otherwise widens the web document past the viewport.
    <View style={styles.shell}>
      <Drawer
        drawerContent={(props) => <SpacesDrawer {...props} />}
        screenOptions={{
          headerShown: false,
          // Permanent sidebar on wide screens; slide-over drawer on phones.
          // On wide, width is 'auto' so the drawer follows SpacesDrawer's
          // animated rail/expanded width.
          drawerType: isWide ? 'permanent' : 'front',
          drawerStyle: {
            backgroundColor: colors.surface,
            width: isWide ? 'auto' : 300,
            borderRightColor: colors.hairline,
            borderRightWidth: isWide ? 1 : 0,
          },
          swipeEdgeWidth: 60,
        }}
      >
        <Drawer.Screen name="index" />
      </Drawer>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, overflow: 'hidden' },
});
