import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';

import { ACTIVE_TOKEN_LIMIT, apiTokenPrefix, buildApiToken } from '@/lib/apiToken';
import { qk } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export type ApiToken = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function useApiTokens() {
  const { userId } = useAuth();
  return useQuery({
    queryKey: qk.apiTokens(userId ?? 'none'),
    enabled: !!userId,
    queryFn: async (): Promise<ApiToken[]> => {
      const { data, error } = await supabase
        .from('api_tokens')
        .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Create a token. The raw value is returned once and is not stored. */
export function useCreateApiToken() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Name this token so you can tell it apart later.');
      if (!userId) throw new Error('You need to be signed in.');

      const { count, error: countError } = await supabase
        .from('api_tokens')
        .select('id', { count: 'exact', head: true })
        .is('revoked_at', null);
      if (countError) throw countError;
      if ((count ?? 0) >= ACTIVE_TOKEN_LIMIT) {
        throw new Error(`You can have ${ACTIVE_TOKEN_LIMIT} active tokens. Revoke one first.`);
      }

      // Hermes has no global Web Crypto (`crypto.getRandomValues` throws
      // "Property 'crypto' doesn't exist"). expo-crypto is already linked;
      // its SHA-256 hex matches hashApiToken on the MCP server.
      const bytes = new Uint8Array(32);
      Crypto.getRandomValues(bytes);
      const { token, tokenHash } = await buildApiToken(bytes, (value) =>
        Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value, {
          encoding: Crypto.CryptoEncoding.HEX,
        }),
      );
      const { error } = await supabase.from('api_tokens').insert({
        user_id: userId,
        name: trimmed,
        token_hash: tokenHash,
        token_prefix: apiTokenPrefix(token),
      });
      if (error) {
        if (error.message.includes('active tokens')) {
          throw new Error(`You can have ${ACTIVE_TOKEN_LIMIT} active tokens. Revoke one first.`);
        }
        throw error;
      }
      return token;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.apiTokens(userId) });
    },
  });
}

export function useRevokeApiToken() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('api_tokens')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      if (userId) qc.invalidateQueries({ queryKey: qk.apiTokens(userId) });
    },
  });
}
