import { createContext, useContext, useMemo, useState } from 'react';

/** Which board view is showing: all tasks, My Week, or a specific space. */
type SpaceContextValue = {
  selectedSpaceId: string; // 'all' | 'my-week' | space uuid
  setSelectedSpaceId: (id: string) => void;
};

const SpaceContext = createContext<SpaceContextValue | undefined>(undefined);

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>('all');
  const value = useMemo(() => ({ selectedSpaceId, setSelectedSpaceId }), [selectedSpaceId]);
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSelectedSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSelectedSpace must be used within a SpaceProvider');
  return ctx;
}
