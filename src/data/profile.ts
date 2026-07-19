import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

const AVATAR_BUCKET = 'avatars';

export function useProfile() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.profile(userId ?? 'none'),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateProfile() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { display_name?: string; avatar_url?: string | null }) => {
      const patch: { display_name?: string; avatar_url?: string | null } = {};
      if (input.display_name !== undefined) patch.display_name = input.display_name.trim();
      if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    },
  });
}

/** Open the library picker for a square profile photo. Returns null if denied or cancelled. */
export async function pickAvatarImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Allow photo access',
      'Trove needs access to your photos to update your profile photo.',
    );
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0].uri;
}

async function uploadAvatar(userId: string, uri: string): Promise<string> {
  const extGuess = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  const ext = extGuess && extGuess.length <= 4 ? extGuess : 'jpg';
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
  const path = `${userId}/${Crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: true });
  if (error) throw error;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Upload a picked image to the avatars bucket and save it as the profile photo. */
export function useUploadAvatar() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uri: string) => {
      if (!userId) throw new Error('Not signed in');
      const publicUrl = await uploadAvatar(userId, uri);
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (error) throw error;
      return publicUrl;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
      // Avatar is embedded in task and roster queries too.
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['roster'] });
    },
  });
}
