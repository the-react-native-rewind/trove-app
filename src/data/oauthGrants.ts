import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export function useOAuthGrants() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.oauthGrants(userId ?? 'none'),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.auth.oauth.listGrants();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRevokeOAuthGrant() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.oauthGrants(userId ?? 'none') });
    },
  });
}
