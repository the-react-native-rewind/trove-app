import AsyncStorage from '@react-native-async-storage/async-storage';

import { readPendingInvite } from './pendingInvite';

const KEY = 'trove.pendingOAuth';

export async function rememberOAuthConsent(authorizationId: string): Promise<void> {
  await AsyncStorage.setItem(KEY, authorizationId);
}

export async function readOAuthConsent(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function clearOAuthConsent(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

/** Where to go after a password sign-in. OAuth consent outranks a pending invite. */
export async function hrefAfterSignIn(): Promise<string> {
  const authorizationId = await readOAuthConsent();
  if (authorizationId) {
    return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  }
  const invite = await readPendingInvite();
  return invite ? `/invite/${invite}` : '/';
}
