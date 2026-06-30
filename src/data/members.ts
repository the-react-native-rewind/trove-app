import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Invite, RosterMember, SpaceRole } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export function useRoster(spaceId: string) {
  return useQuery({
    queryKey: qk.roster(spaceId),
    enabled: spaceId !== 'all',
    queryFn: async (): Promise<RosterMember[]> => {
      const { data, error } = await supabase
        .from('space_members')
        .select('*, profile:profiles(id,display_name,avatar_url)')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RosterMember[];
    },
  });
}

export function usePendingInvites(spaceId: string) {
  return useQuery({
    queryKey: qk.invites(spaceId),
    enabled: spaceId !== 'all',
    queryFn: async (): Promise<Invite[]> => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .eq('space_id', spaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateInvite(spaceId: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: SpaceRole }): Promise<Invite> => {
      const role = input.role === 'owner' ? 'member' : input.role; // owner is not invitable
      const { data, error } = await supabase
        .from('invites')
        .insert({
          space_id: spaceId,
          email: input.email.trim().toLowerCase(),
          role,
          invited_by: userId,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.invites(spaceId) });
    },
  });
}

export function useRevokeInvite(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('invites')
        .update({ status: 'revoked' })
        .eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.invites(spaceId) }),
  });
}

export function useUpdateMemberRole(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memberId: string; role: SpaceRole }) => {
      const { error } = await supabase
        .from('space_members')
        .update({ role: input.role })
        .eq('id', input.memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.roster(spaceId) }),
  });
}

export function useRemoveMember(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from('space_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roster(spaceId) });
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useLeaveSpace() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (spaceId: string) => {
      const { error } = await supabase
        .from('space_members')
        .delete()
        .eq('space_id', spaceId)
        .eq('user_id', userId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.spaces }),
  });
}

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_invite', { p_token: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.spaces }),
  });
}
