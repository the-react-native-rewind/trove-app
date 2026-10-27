import { createContext, useContext, useMemo, useState } from 'react';

import { TODAY_VIEW_ID } from '@/lib/today';

/** Which board view is showing: Today, Mine, My Week, or a specific space. */
type SpaceContextValue = {
  selectedSpaceId: string; // 'today' | 'all' | 'my-week' | space uuid
  setSelectedSpaceId: (id: string) => void;
};

const SpaceContext = createContext<SpaceContextValue | undefined>(undefined);

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(TODAY_VIEW_ID);
  const value = useMemo(() => ({ selectedSpaceId, setSelectedSpaceId }), [selectedSpaceId]);
  return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSelectedSpace() {
  const ctx = useContext(SpaceContext);
  if (!ctx) throw new Error('useSelectedSpace must be used within a SpaceProvider');
  return ctx;
}
