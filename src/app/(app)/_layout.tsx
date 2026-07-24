import { Drawer } from 'expo-router/drawer';

import { SpacesDrawer } from '@/components/SpacesDrawer';
import { useIsWide } from '@/hooks/useIsWide';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  const isWide = useIsWide();
  return (
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
  );
}
