import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'trove.pendingInvite';

export async function rememberPendingInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY, token);
}

export async function readPendingInvite(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
