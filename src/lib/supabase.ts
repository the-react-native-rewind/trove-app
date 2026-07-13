import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env',
  );
}

// On web the app renders in the browser (SPA), but Metro/Expo may still evaluate
// this module in a Node context where `window` (and localStorage) is absent.
// Fall back to a no-op store there so client construction never touches `window`.
const isBrowserOrNative = typeof window !== 'undefined' || typeof navigator !== 'undefined';
const memoryStore = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: isBrowserOrNative ? AsyncStorage : memoryStore,
    persistSession: isBrowserOrNative,
    autoRefreshToken: isBrowserOrNative,
    detectSessionInUrl: false,
  },
});

// Refresh the session while a native app is in the foreground; pause it in the
// background. AppState is a no-op on web, so this only matters on iOS/Android.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
