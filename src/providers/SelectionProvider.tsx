import * as Haptics from 'expo-haptics';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { BackHandler, Platform } from 'react-native';

type SelectionContextValue = {
  active: boolean;
  selectedIds: ReadonlySet<string>;
  count: number;
  isSelected: (id: string) => boolean;
  enter: (id: string) => void;
  toggle: (id: string) => void;
  selectAll: (ids: readonly string[]) => void;
  exit: () => void;
};

const emptySelection = new Set<string>();

const inactive: SelectionContextValue = {
  active: false,
  selectedIds: emptySelection,
  count: 0,
  isSelected: () => false,
  enter: () => {},
  toggle: () => {},
  selectAll: () => {},
  exit: () => {},
};

const SelectionContext = createContext<SelectionContextValue>(inactive);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(emptySelection);

  const exit = useCallback(() => {
    setActive(false);
    setSelectedIds(emptySelection);
  }, []);

  const enter = useCallback((id: string) => {
    setActive(true);
    setSelectedIds(new Set([id]));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: readonly string[]) => {
    if (ids.length === 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      exit();
      return true;
    });
    return () => subscription.remove();
  }, [active, exit]);

  useEffect(() => {
    if (!active || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, exit]);

  const value = useMemo<SelectionContextValue>(
    () => ({
      active,
      selectedIds,
      count: selectedIds.size,
      isSelected,
      enter,
      toggle,
      selectAll,
      exit,
    }),
    [active, selectedIds, isSelected, enter, toggle, selectAll, exit],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  return useContext(SelectionContext);
}
