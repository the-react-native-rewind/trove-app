import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/lib/types';
import { useAuth } from '@/providers/AuthProvider';

export type ProjectMember = {
  project_id: string;
  user_id: string;
};

export function useProjects(spaceId: string) {
  return useQuery({
    queryKey: qk.projects(spaceId),
    enabled: spaceId !== 'all' && spaceId.length > 0,
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('space_id', spaceId)
        .is('archived_at', null)
        .order('rank', { ascending: false })
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['project', projectId],
    enabled: projectId.length > 0,
    queryFn: async (): Promise<Project | null> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Allow-list rows the caller can read: their own, or every row when they manage the circle. */
export function useProjectMembers(spaceId: string) {
  return useQuery({
    queryKey: qk.projectMembers(spaceId),
    enabled: spaceId !== 'all' && spaceId.length > 0,
    queryFn: async (): Promise<ProjectMember[]> => {
      const { data: projects, error: projectError } = await supabase
        .from('projects')
        .select('id')
        .eq('space_id', spaceId);
      if (projectError) throw projectError;
      const ids = (projects ?? []).map((project) => project.id);
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id, user_id')
        .in('project_id', ids);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateProject(spaceId: string) {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string; description?: string | null }) => {
      // Insert and read are separate. A limited member is added to the project
      // by a trigger, and INSERT ... RETURNING cannot see that row yet.
      const id = Crypto.randomUUID();
      const { error } = await supabase.from('projects').insert({
        id,
        space_id: spaceId,
        name: input.name.trim(),
        color: input.color?.trim() || 'sage',
        description: input.description?.trim() || null,
        created_by: userId,
      });
      if (error) throw error;
      const { data, error: readError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();
      if (readError) throw readError;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projects(spaceId) });
      qc.invalidateQueries({ queryKey: qk.projectMembers(spaceId) });
    },
  });
}

export function useSetMemberProjects(spaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; projectIds: string[] }) => {
      const { error } = await supabase.rpc('set_member_projects', {
        p_space_id: spaceId,
        p_user_id: input.userId,
        p_project_ids: input.projectIds,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.projectMembers(spaceId) });
      qc.invalidateQueries({ queryKey: qk.projects(spaceId) });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
