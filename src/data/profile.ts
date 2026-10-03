import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { alertDialog } from '@/lib/dialog';
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

type ProfilePatch = {
  display_name?: string;
  avatar_url?: string | null;
  my_week_enabled?: boolean;
};

export function useUpdateProfile() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProfilePatch) => {
      const patch: ProfilePatch = {};
      if (input.display_name !== undefined) patch.display_name = input.display_name.trim();
      if (input.avatar_url !== undefined) patch.avatar_url = input.avatar_url;
      if (input.my_week_enabled !== undefined) patch.my_week_enabled = input.my_week_enabled;
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId!);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return;
      const key = qk.profile(userId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Profile | null>(key);
      qc.setQueryData<Profile | null>(key, (current) => {
        if (!current) return current;
        return {
          ...current,
          ...(input.display_name !== undefined ? { display_name: input.display_name.trim() } : {}),
          ...(input.avatar_url !== undefined ? { avatar_url: input.avatar_url } : {}),
          ...(input.my_week_enabled !== undefined ? { my_week_enabled: input.my_week_enabled } : {}),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (userId && context?.previous !== undefined) {
        qc.setQueryData(qk.profile(userId), context.previous);
      }
    },
    onSettled: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.profile(userId) });
    },
  });
}

/** My Week is off until this person turns it on. Missing profile data stays off. */
export function useMyWeekEnabled(): boolean {
  const { data: profile } = useProfile();
  return profile?.my_week_enabled === true;
}

/** Open the library picker for a square profile photo. Returns null if denied or cancelled. */
export async function pickAvatarImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alertDialog(
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
