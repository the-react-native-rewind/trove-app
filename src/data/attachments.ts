import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const BUCKET = 'task-media';

export type MediaType = 'image' | 'video';

export type Attachment = {
  id: string;
  path: string;
  media_type: MediaType;
  url: string | null; // signed URL for display
};

export type PickedMedia = { uri: string; mediaType: MediaType };

export function taskAttachmentsKey(taskId: string) {
  return ['task-attachments', taskId] as const;
}

/** Open the library picker. Returns null if denied or cancelled. */
export async function pickMedia(): Promise<PickedMedia | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Allow photo access', 'Trove needs access to your photos to add media to a task.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mediaType: asset.type === 'video' ? 'video' : 'image' };
}

/** Upload one file to storage and record it against a task. */
export async function uploadTaskMedia(params: {
  taskId: string;
  spaceId: string;
  uri: string;
  mediaType: MediaType;
  userId: string | null;
}) {
  const { taskId, spaceId, uri, mediaType, userId } = params;
  const extGuess = uri.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
  const ext = extGuess && extGuess.length <= 4 ? extGuess : mediaType === 'video' ? 'mp4' : 'jpg';
  const path = `${spaceId}/${taskId}/${Crypto.randomUUID()}.${ext}`;
  const contentType =
    mediaType === 'video'
      ? `video/${ext === 'mov' ? 'quicktime' : ext}`
      : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const arrayBuffer = await fetch(uri).then((r) => r.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType, upsert: false });
  if (upErr) throw upErr;

  const { error: rowErr } = await supabase.from('task_attachments').insert({
    task_id: taskId,
    space_id: spaceId,
    path,
    media_type: mediaType,
    created_by: userId,
  });
  if (rowErr) throw rowErr;
}

export function useTaskAttachments(taskId: string) {
  return useQuery({
    queryKey: taskAttachmentsKey(taskId),
    enabled: !!taskId,
    queryFn: async (): Promise<Attachment[]> => {
      const { data, error } = await supabase
        .from('task_attachments')
        .select('id, path, media_type')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(rows.map((r) => r.path), 60 * 60);
      const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

      return rows.map((r) => ({
        id: r.id,
        path: r.path,
        media_type: r.media_type as MediaType,
        url: urlByPath.get(r.path) ?? null,
      }));
    },
  });
}

export function useAddAttachment(taskId: string, spaceId: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PickedMedia) =>
      uploadTaskMedia({ taskId, spaceId, uri: input.uri, mediaType: input.mediaType, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskAttachmentsKey(taskId) }),
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: { id: string; path: string }) => {
      await supabase.storage.from(BUCKET).remove([attachment.path]);
      const { error } = await supabase.from('task_attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: taskAttachmentsKey(taskId) }),
  });
}
