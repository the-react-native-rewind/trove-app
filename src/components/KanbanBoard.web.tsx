import { type CSSProperties, Fragment, useState } from 'react';

import { positionBetween } from '@/data/tasks';
import { groupByStatus, type KanbanProps, STATUSES } from '@/lib/board';
import type { TaskStatus } from '@/lib/types';
import { colors, fonts, radii } from '@/theme/tokens';
import { TaskCard } from './TaskCard';

/**
 * Web Kanban: four columns with real drag-and-drop across columns using the
 * HTML5 Drag and Drop API (react-dom renders this file, so DOM events work).
 */
/**
 * Replace the browser's default drag snapshot (a square, opaque box that can
 * even include scrollbars) with a clean clone of the card: clipped to the
 * card radius, no shadow, fixed to the card's on-screen width.
 */
function setCardDragImage(e: React.DragEvent<HTMLDivElement>) {
  if (typeof e.dataTransfer.setDragImage !== 'function') return;
  const node = e.currentTarget;
  const rect = node.getBoundingClientRect();
  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.position = 'fixed';
  clone.style.top = '-10000px';
  clone.style.left = '-10000px';
  clone.style.width = `${rect.width}px`;
  clone.style.borderRadius = `${radii.card}px`;
  clone.style.overflow = 'hidden';
  clone.style.pointerEvents = 'none';
  clone.style.margin = '0';
  for (const el of clone.querySelectorAll<HTMLElement>('*')) {
    el.style.boxShadow = 'none';
    el.style.overflow = 'hidden';
  }
  document.body.appendChild(clone);
  e.dataTransfer.setDragImage(clone, e.clientX - rect.left, e.clientY - rect.top);
  setTimeout(() => clone.remove(), 0);
}

export function KanbanBoard({ tasks, showSpaceTag, onOpen, onMove, canWriteTask }: KanbanProps) {
  const byStatus = groupByStatus(tasks);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);
  const [overIndex, setOverIndex] = useState<number>(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /** Insertion index in `column` for a pointer at clientY (dragged card excluded). */
  function insertionIndex(columnEl: HTMLElement, column: typeof tasks, clientY: number): number {
    const wrappers = [...columnEl.querySelectorAll<HTMLElement>('div[draggable]')];
    let index = 0;
    for (let i = 0; i < wrappers.length && i < column.length; i++) {
      if (column[i].id === draggingId) continue; // ignore the card being dragged
      const r = wrappers[i].getBoundingClientRect();
      if (clientY > r.top + r.height / 2) index = index + 1;
    }
    return index;
  }

  return (
    <div style={styles.board}>
      {STATUSES.map(({ key, label }) => {
        const status = key as TaskStatus;
        const column = byStatus[status];
        const isOver = overCol === status;
        const rest = column.filter((t) => t.id !== draggingId);
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const index = insertionIndex(e.currentTarget, column, e.clientY);
              if (overCol !== status) setOverCol(status);
              if (overIndex !== index) setOverIndex(index);
            }}
            onDragLeave={(e) => {
              // Only clear when the pointer actually leaves the column.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setOverCol((c) => (c === status ? null : c));
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              const index = insertionIndex(e.currentTarget, column, e.clientY);
              setOverCol(null);
              if (!id) return;
              // Fractional position between the drop point's neighbours.
              const remaining = column.filter((t) => t.id !== id);
              const prev = index > 0 ? remaining[index - 1]?.position ?? null : null;
              const next = remaining[index]?.position ?? null;
              onMove(id, status, positionBetween(prev, next));
            }}
            style={{
              ...styles.column,
              backgroundColor: isOver ? colors.brandSoft : 'transparent',
            }}
          >
            <div style={styles.head}>
              <span style={styles.headLabel}>{label}</span>
              <span style={styles.headCount}>{column.length}</span>
            </div>
            <div style={styles.body}>
              {(() => {
                let filteredIndex = 0;
                return column.map((task) => {
                  const canDrag = canWriteTask(task.space_id);
                  const isDragSource = task.id === draggingId;
                  const showLine =
                    isOver && draggingId !== null && !isDragSource && filteredIndex === overIndex;
                  if (!isDragSource) filteredIndex += 1;
                  return (
                    <Fragment key={task.id}>
                      {showLine ? <div style={styles.dropLine} /> : null}
                  <div
                    draggable={canDrag}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setCardDragImage(e);
                      setDraggingId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setOverCol(null);
                    }}
                    style={{
                      cursor: canDrag ? 'grab' : 'default',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: radii.card,
                      opacity: draggingId === task.id ? 0.35 : 1,
                      transition: 'opacity 120ms ease',
                    }}
                  >
                    <TaskCard task={task} showSpaceTag={showSpaceTag} onPress={() => onOpen(task.id)} />
                  </div>
                    </Fragment>
                  );
                });
              })()}
              {isOver && draggingId !== null && rest.length > 0 && overIndex >= rest.length ? (
                <div style={styles.dropLine} />
              ) : null}
              {column.length === 0 ? (
                <div style={styles.empty}>Drop here</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  board: {
    display: 'flex',
    gap: 24,
    padding: '8px 24px 24px',
    flex: 1,
    minHeight: 0,
    width: '100%',
    boxSizing: 'border-box',
    overflowX: 'auto',
    alignItems: 'stretch',
  },
  column: {
    flex: '1 1 0',
    minWidth: 220,
    borderRadius: radii.lg,
    padding: '8px 0',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transition: 'background-color 120ms ease',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 2px 10px',
  },
  headLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  headCount: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.inkFaint },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
  },
  dropLine: {
    height: 3,
    borderRadius: 2,
    background: colors.brand,
    margin: '-7.5px 2px',
    flexShrink: 0,
  },
  empty: {
    border: `1px dashed ${colors.hairline}`,
    borderRadius: radii.card,
    padding: 16,
    textAlign: 'center',
    color: colors.inkFaint,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
};
