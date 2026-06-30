import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/** Centralised query keys so invalidation stays consistent. */
export const qk = {
  session: ['session'] as const,
  profile: (userId: string) => ['profile', userId] as const,
  spaces: ['spaces'] as const,
  space: (spaceId: string) => ['space', spaceId] as const,
  roster: (spaceId: string) => ['roster', spaceId] as const,
  invites: (spaceId: string) => ['invites', spaceId] as const,
  // spaceId 'all' => the adaptive backlog across every space
  tasks: (spaceId: string) => ['tasks', spaceId] as const,
  task: (taskId: string) => ['task', taskId] as const,
};
