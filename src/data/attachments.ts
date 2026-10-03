import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { alertDialog } from '@/lib/dialog';
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

const mediaBatchKey = ['task-media-batch'] as const;

function invalidateTaskMedia(qc: ReturnType<typeof useQueryClient>, taskId: string) {
  qc.invalidateQueries({ queryKey: taskAttachmentsKey(taskId) });
  qc.invalidateQueries({ queryKey: mediaBatchKey });
}

/** Open the library picker. Returns null if denied or cancelled. */
export async function pickMedia(): Promise<PickedMedia | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alertDialog('Allow photo access', 'Trove needs access to your photos to add media to a task.');
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
    onSuccess: () => invalidateTaskMedia(qc, taskId),
  });
}

export function useDeleteAttachment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (attachment: { id: string; path: string }) => {
      // Recurring tasks share one storage object across occurrences. Remove the
      // file only when this is the last row pointing at it. If the check fails,
      // keep the file: a sibling occurrence may still display it.
      const { data: shared, error: sharedError } = await supabase.rpc('attachment_path_in_use', {
        p_path: attachment.path,
        p_except_id: attachment.id,
      });
      if (!sharedError && !shared) {
        await supabase.storage.from(BUCKET).remove([attachment.path]);
      }
      const { error } = await supabase.from('task_attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateTaskMedia(qc, taskId),
  });
}

const MEDIA_CHUNK = 80;

/** One signed-url lookup for every task currently on screen, instead of a query per card. */
export async function loadTaskMediaMap(taskIds: readonly string[]): Promise<Record<string, Attachment[]>> {
  const unique = [...new Set(taskIds)];
  const map: Record<string, Attachment[]> = {};
  for (const id of unique) map[id] = [];
  if (unique.length === 0) return map;

  const rows: { id: string; task_id: string; path: string; media_type: string }[] = [];
  for (let i = 0; i < unique.length; i += MEDIA_CHUNK) {
    const slice = unique.slice(i, i + MEDIA_CHUNK);
    const { data, error } = await supabase
      .from('task_attachments')
      .select('id, task_id, path, media_type')
      .in('task_id', slice)
      .order('created_at', { ascending: true });
    if (error) throw error;
    rows.push(...(data ?? []));
  }

  const urlByPath = new Map<string, string | null>();
  for (let i = 0; i < rows.length; i += MEDIA_CHUNK) {
    const slice = rows.slice(i, i + MEDIA_CHUNK).map((row) => row.path);
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(slice, 60 * 60);
    for (const item of signed ?? []) {
      if (item.path) urlByPath.set(item.path, item.signedUrl);
    }
  }

  for (const row of rows) {
    const list = map[row.task_id] ?? [];
    list.push({
      id: row.id,
      path: row.path,
      media_type: row.media_type === 'video' ? 'video' : 'image',
      url: urlByPath.get(row.path) ?? null,
    });
    map[row.task_id] = list;
  }
  return map;
}

export function useTaskMediaForTasks(taskIds: readonly string[]) {
  const ids = [...new Set(taskIds)].sort();
  return useQuery({
    queryKey: [...mediaBatchKey, ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: () => loadTaskMediaMap(ids),
  });
}
