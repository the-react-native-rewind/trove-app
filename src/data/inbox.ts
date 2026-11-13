import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import {
  INBOX_APP_SOURCE,
  insertInboxItem,
  normalizeInboxText,
  replaceInboxItemId,
  withoutInboxItem,
  type InboxItem,
} from '@/lib/inbox';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { localToday } from '@/lib/today';
import { useAuth } from '@/providers/AuthProvider';

type InboxRow = {
  id: string;
  text: string;
  source: string | null;
  created_at: string;
};

const INBOX_SELECT = 'id, text, source, created_at';

function mapInboxRow(row: InboxRow): InboxItem {
  return { id: row.id, text: row.text, source: row.source, createdAt: row.created_at };
}

/** Unresolved capture lines for the signed-in person, newest first. */
export function useInbox() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.inbox(userId ?? ''),
    enabled: !!userId,
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase
        .from('inbox_items')
        .select(INBOX_SELECT)
        .is('accepted_at', null)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) => mapInboxRow(row as InboxRow));
    },
  });
}

let pendingInboxSerial = 0;
function nextPendingInboxId(): string {
  pendingInboxSerial += 1;
  return `pending-inbox:${pendingInboxSerial}`;
}

function patchInbox(qc: QueryClient, userId: string, map: (items: InboxItem[]) => InboxItem[]) {
  const key = qk.inbox(userId);
  const current = qc.getQueryData<InboxItem[]>(key);
  if (!current) return;
  const next = map(current);
  if (next !== current) qc.setQueryData(key, next);
}

/** Capture a line into the inbox. Frictionless: just text, triaged later. */
export function useAddInboxItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rawText: string): Promise<string> => {
      const text = normalizeInboxText(rawText);
      const { data, error } = await supabase
        .from('inbox_items')
        .insert({ text, source: INBOX_APP_SOURCE })
        .select('id')
        .single();
      if (error) throw error;
      return (data as { id: string }).id;
    },
    onMutate: async (rawText) => {
      const text = normalizeInboxText(rawText);
      if (!userId || !text) return { tempId: undefined };
      await qc.cancelQueries({ queryKey: qk.inbox(userId) });
      const tempId = nextPendingInboxId();
      patchInbox(qc, userId, (items) =>
        insertInboxItem(items, {
          id: tempId,
          text,
          source: INBOX_APP_SOURCE,
          createdAt: new Date().toISOString(),
        }),
      );
      return { tempId };
    },
    onError: (_error, _text, context) => {
      if (userId && context?.tempId) patchInbox(qc, userId, (items) => withoutInboxItem(items, context.tempId!));
    },
    onSuccess: (id, _text, context) => {
      if (userId && context?.tempId) patchInbox(qc, userId, (items) => replaceInboxItemId(items, context.tempId!, id));
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.inbox(userId) });
    },
  });
}

/** Decline a line: it leaves the inbox and is not carried forward. */
export function useDismissInboxItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inbox_items')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      if (!userId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: qk.inbox(userId) });
      const previous = qc.getQueryData<InboxItem[]>(qk.inbox(userId));
      patchInbox(qc, userId, (items) => withoutInboxItem(items, id));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (userId && context?.previous) qc.setQueryData(qk.inbox(userId), context.previous);
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.inbox(userId) });
    },
  });
}

/**
 * Add a line straight onto today's plan as a quick line (not an action, not in
 * a circle) and take it off the inbox. This is the lightweight triage door: a
 * thing to do today that doesn't need to become tracked work.
 */
export function useSendInboxItemToToday() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: InboxItem) => {
      const day = localToday();
      const { error: addError } = await supabase.rpc('add_today_item', {
        p_day: day,
        p_text: item.text,
        p_task_id: null,
        p_as_of: day,
      });
      if (addError) throw addError;
      const { error: resolveError } = await supabase
        .from('inbox_items')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', item.id);
      if (resolveError) throw resolveError;
    },
    onMutate: async (item) => {
      if (!userId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: qk.inbox(userId) });
      const previous = qc.getQueryData<InboxItem[]>(qk.inbox(userId));
      patchInbox(qc, userId, (items) => withoutInboxItem(items, item.id));
      return { previous };
    },
    onError: (_error, _item, context) => {
      if (userId && context?.previous) qc.setQueryData(qk.inbox(userId), context.previous);
    },
    onSettled: () => {
      if (!userId) return;
      void qc.invalidateQueries({ queryKey: qk.inbox(userId) });
      void qc.invalidateQueries({ queryKey: ['today', userId] });
    },
  });
}

/**
 * Link a line to the action it became and take it off the inbox. Called after
 * the action is created from the capture sheet, so the one-way street holds:
 * the inbox line is consumed, the work now lives in Trove.
 */
export function useAcceptInboxItem() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; taskId: string }) => {
      const { error } = await supabase
        .from('inbox_items')
        .update({ accepted_at: new Date().toISOString(), task_id: input.taskId })
        .eq('id', input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      if (!userId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: qk.inbox(userId) });
      const previous = qc.getQueryData<InboxItem[]>(qk.inbox(userId));
      patchInbox(qc, userId, (items) => withoutInboxItem(items, input.id));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (userId && context?.previous) qc.setQueryData(qk.inbox(userId), context.previous);
    },
    onSettled: () => {
      if (userId) void qc.invalidateQueries({ queryKey: qk.inbox(userId) });
    },
  });
}
