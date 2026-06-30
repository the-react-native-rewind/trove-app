import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const BUCKET = 'task-media';

export type Attachment = {
  id: string;
  path: string;
  media_type: 'image' | 'video';
  url: string | null; // signed URL for display
};

export function taskAttachmentsKey(taskId: string) {
  return ['task-attachments', taskId] as const;
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
        media_type: r.media_type as 'image' | 'video',
        url: urlByPath.get(r.path) ?? null,
      }));
    },
  });
}

export function useAddAttachment(taskId: string, spaceId: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { uri: string; mediaType: 'image' | 'video' }) => {
      const extGuess = input.uri.split('.').pop()?.split('?')[0]?.toLowerCase() || '';
      const ext = extGuess && extGuess.length <= 4 ? extGuess : input.mediaType === 'video' ? 'mp4' : 'jpg';
      const path = `${spaceId}/${taskId}/${Crypto.randomUUID()}.${ext}`;
      const contentType =
        input.mediaType === 'video' ? `video/${ext === 'mov' ? 'quicktime' : ext}` : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const arrayBuffer = await fetch(input.uri).then((r) => r.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, arrayBuffer, { contentType, upsert: false });
      if (upErr) throw upErr;

      const { error: rowErr } = await supabase.from('task_attachments').insert({
        task_id: taskId,
        space_id: spaceId,
        path,
        media_type: input.mediaType,
        created_by: userId,
      });
      if (rowErr) throw rowErr;
    },
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
