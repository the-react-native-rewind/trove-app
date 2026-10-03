import { useCallback, useEffect, useRef, useState } from 'react';

import { useUpdateTaskRank } from '@/data/tasks';
import { sortTasksByUrgency } from '@/lib/board';
import { hapticLight } from '@/lib/haptics';
import { rankAfterStepUp } from '@/lib/rank';
import type { TaskWithRefs } from '@/lib/types';

const SETTLE_MS = 1000;
const HIGHLIGHT_MS = 900;

export const PRIORITY_VIEWABILITY = { itemVisiblePercentThreshold: 40 };

type ScrollableList = {
  scrollToIndex: (params: { index: number; viewPosition?: number; animated?: boolean }) => void;
};

/**
 * Each tap lifts a task one place in the ordered list it is looking at.
 * The card stays put until about a second after the last tap, then one rank
 * write moves it. Rapid taps still each count.
 */
export function usePriorityLift(onCommit?: (taskId: string) => void) {
  const updateRank = useUpdateTaskRank();
  const pendingRef = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  useEffect(
    () => () => {
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
    },
    [],
  );

  return useCallback(
    (taskId: string, visualOrder: readonly TaskWithRefs[]) => {
      const overlaid = visualOrder.map((task) =>
        pendingRef.current[task.id] ? { ...task, rank: pendingRef.current[task.id] } : task,
      );
      const next = rankAfterStepUp(taskId, sortTasksByUrgency(overlaid));
      if (!next) return false;
      hapticLight();
      pendingRef.current = { ...pendingRef.current, [taskId]: next };
      const existing = timers.current[taskId];
      if (existing) clearTimeout(existing);
      timers.current[taskId] = setTimeout(() => {
        const rank = pendingRef.current[taskId];
        const rest = { ...pendingRef.current };
        delete rest[taskId];
        pendingRef.current = rest;
        delete timers.current[taskId];
        if (!rank) return;
        updateRank.mutate({ id: taskId, rank });
        onCommitRef.current?.(taskId);
      }, SETTLE_MS);
      return true;
    },
    [updateRank],
  );
}

/**
 * Phone lists: when a lifted card's new place is off screen, scroll to it and
 * highlight the landing spot. On-screen cards just slide via the list layout
 * animation.
 */
export function usePriorityList(
  items: readonly { id: string }[],
  listRef: { readonly current: ScrollableList | null },
) {
  const viewableIds = useRef(new Set<string>());
  const sawViewable = useRef(false);
  const followId = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const orderKey = items.map((item) => item.id).join('\0');

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: readonly { item?: { id?: string } | null }[] }) => {
      sawViewable.current = true;
      viewableIds.current = new Set(
        viewableItems.flatMap((entry) => (entry.item?.id ? [entry.item.id] : [])),
      );
    },
    [],
  );

  const lift = usePriorityLift((taskId) => {
    if (!sawViewable.current || viewableIds.current.has(taskId)) return;
    followId.current = taskId;
  });

  useEffect(() => {
    const id = followId.current;
    if (!id) return;
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    followId.current = null;
    const scrollTimer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.35, animated: true });
    }, 60);
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => {
      setHighlightId((current) => (current === id ? null : current));
    }, HIGHLIGHT_MS);
    return () => clearTimeout(scrollTimer);
    // items is read only when the visible order changes. A fresh array with
    // the same ids must not cancel the scroll that follows a lift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    },
    [],
  );

  return { lift, highlightId, onViewableItemsChanged };
}
