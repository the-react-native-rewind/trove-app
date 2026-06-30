import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Space, SpaceRole, SpaceWithMeta } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

/** Spaces the current user belongs to, with their role and open-task count. Personal pinned first. */
export function useSpaces() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.spaces,
    enabled: !!userId,
    queryFn: async (): Promise<SpaceWithMeta[]> => {
      const { data: memberships, error } = await supabase
        .from('space_members')
        .select('role, space:spaces(*)')
        .eq('user_id', userId!);
      if (error) throw error;

      const { data: openTasks, error: taskErr } = await supabase
        .from('tasks')
        .select('space_id')
        .neq('status', 'done');
      if (taskErr) throw taskErr;

      const counts = new Map<string, number>();
      for (const t of openTasks ?? []) {
        counts.set(t.space_id, (counts.get(t.space_id) ?? 0) + 1);
      }

      const spaces: SpaceWithMeta[] = (memberships ?? [])
        .filter((m) => m.space)
        .map((m) => {
          const space = m.space as unknown as Space;
          return {
            ...space,
            role: m.role as SpaceRole,
            openCount: counts.get(space.id) ?? 0,
          };
        });

      return spaces.sort((a, b) => {
        if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    },
  });
}

export function useCreateSpace() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      // Generate the id client-side and skip the representation read. A brand-new
      // space has no membership yet (the owner row is added by an AFTER trigger),
      // so a RETURNING select would be hidden by the spaces RLS policy and 401.
      const id = Crypto.randomUUID();
      const { error } = await supabase
        .from('spaces')
        .insert({ id, name: input.name.trim(), color: input.color, owner_id: userId! });
      if (error) throw error;
      return { id, name: input.name.trim(), color: input.color } as Pick<
        Space,
        'id' | 'name' | 'color'
      >;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}

export function useUpdateSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; name?: string; color?: string }) => {
      const patch: { name?: string; color?: string } = {};
      if (input.name !== undefined) patch.name = input.name.trim();
      if (input.color !== undefined) patch.color = input.color;
      const { error } = await supabase.from('spaces').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: qk.spaces });
      qc.invalidateQueries({ queryKey: qk.space(vars.id) });
    },
  });
}

export function useDeleteSpace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('spaces').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.spaces });
    },
  });
}
