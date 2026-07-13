import { type CSSProperties, useState } from 'react';

import { groupByStatus, type KanbanProps, STATUSES } from '@/lib/board';
import type { TaskStatus } from '@/lib/types';
import { colors, fonts, radii } from '@/theme/tokens';
import { TaskCard } from './TaskCard';

/**
 * Web Kanban: four columns with real drag-and-drop across columns using the
 * HTML5 Drag and Drop API (react-dom renders this file, so DOM events work).
 */
export function KanbanBoard({ tasks, showSpaceTag, onOpen, onMove, canWriteTask }: KanbanProps) {
  const byStatus = groupByStatus(tasks);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  return (
    <div style={styles.board}>
      {STATUSES.map(({ key, label }) => {
        const status = key as TaskStatus;
        const column = byStatus[status];
        const isOver = overCol === status;
        return (
          <div
            key={key}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (overCol !== status) setOverCol(status);
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
              setOverCol(null);
              if (id) onMove(id, status);
            }}
            style={{
              ...styles.column,
              backgroundColor: isOver ? colors.brandSoft : colors.surfaceAlt,
              borderColor: isOver ? colors.brand : colors.hairline,
            }}
          >
            <div style={styles.head}>
              <span style={styles.headLabel}>{label}</span>
              <span style={styles.headCount}>{column.length}</span>
            </div>
            <div style={styles.body}>
              {column.map((task) => {
                const canDrag = canWriteTask(task.space_id);
                return (
                  <div
                    key={task.id}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', task.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    style={{ cursor: canDrag ? 'grab' : 'default' }}
                  >
                    <TaskCard task={task} showSpaceTag={showSpaceTag} onPress={() => onOpen(task.id)} />
                  </div>
                );
              })}
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
    gap: 16,
    padding: 16,
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
    borderWidth: 1,
    borderStyle: 'solid',
    padding: 10,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transition: 'background-color 120ms ease, border-color 120ms ease',
  },
  head: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 6px 10px',
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
