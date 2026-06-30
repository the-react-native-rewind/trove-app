import { Drawer } from 'expo-router/drawer';

import { SpacesDrawer } from '@/components/SpacesDrawer';
import { colors } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <Drawer
      drawerContent={(props) => <SpacesDrawer {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
        drawerStyle: { backgroundColor: colors.surface, width: 300 },
        swipeEdgeWidth: 60,
      }}
    >
      <Drawer.Screen name="index" />
    </Drawer>
  );
}
