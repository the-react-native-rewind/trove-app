import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  useAgentLog,
  useDeleteAgentLogEntry,
  useEditHandoffNote,
  useTaskHandoffs,
  type AgentLogRow,
} from '@/data/tasks';
import { confirmDialog } from '@/lib/dialog';
import { formatHandoffAge, handoffStatusLabel, type HandoffStatus, type TaskHandoff } from '@/lib/handoff';
import { useDictation } from '@/hooks/useDictation';
import { colors, fonts, radii, resolveAccent, spacing } from '@/theme/tokens';
import { MarkdownNotes } from './MarkdownNotes';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Text } from './ui/Text';

export type HandoffMember = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export function HandoffNoteLine({
  name,
  avatarUrl,
  note,
  accent,
}: {
  name: string;
  avatarUrl?: string | null;
  note: string;
  accent?: string | null;
}) {
  return (
    <View style={styles.noteRow}>
      <View style={[styles.noteBar, { backgroundColor: resolveAccent(accent) }]} />
      <Avatar name={name} uri={avatarUrl} size={16} />
      <Text variant="meta" color={colors.inkSoft} numberOfLines={2} style={styles.noteCopy}>
        <Text variant="meta" style={styles.noteName}>
          {name}:{' '}
        </Text>
        {note}
      </Text>
    </View>
  );
}

export function HandoffSheet({
  members,
  currentStatus,
  busy,
  onClose,
  onSubmit,
}: {
  members: HandoffMember[];
  currentStatus: string;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (input: {
    toUserId: string;
    toName: string;
    toAvatarUrl: string | null;
    status: HandoffStatus;
    note: string | null;
  }) => Promise<void> | void;
}) {
  const only = members.length === 1 ? members[0] : null;
  const [person, setPerson] = useState<HandoffMember | null>(only ?? null);
  const [step, setStep] = useState<'person' | 'status' | 'note'>(only ? 'status' : 'person');
  const [status, setStatus] = useState<HandoffStatus>(currentStatus === 'in_progress' ? 'in_progress' : 'todo');
  const [note, setNote] = useState('');
  const dictationBase = useRef('');
  const dictation = useDictation((transcript) => {
    const base = dictationBase.current;
    const joiner = base && !base.endsWith(' ') ? ' ' : '';
    setNote((base + joiner + transcript).slice(0, 2000));
  });

  function chooseStatus(next: HandoffStatus) {
    setStatus(next);
    setStep('note');
  }

  async function finish(skip: boolean) {
    if (!person) return;
    const trimmed = skip ? '' : note.trim();
    await onSubmit({
      toUserId: person.id,
      toName: person.name,
      toAvatarUrl: person.avatarUrl,
      status,
      note: trimmed || null,
    });
  }

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text variant="bodyMedium">Hand off</Text>
          {step === 'person' ? (
            <View style={styles.stack}>
              {members.map((member) => (
                <Pressable
                  key={member.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Hand to ${member.name}`}
                  onPress={() => {
                    setPerson(member);
                    setStep('status');
                  }}
                  style={styles.choice}
                >
                  <Avatar name={member.name} uri={member.avatarUrl} size={28} />
                  <Text variant="bodyMedium">Hand to {member.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {step === 'status' && person ? (
            <View style={styles.stack}>
              <Text variant="bodyMedium">Hand to {person.name}</Text>
              <Text variant="meta" color={colors.inkSoft}>
                Is this in progress?
              </Text>
              <Button
                label="Yes, in progress"
                variant={status === 'in_progress' ? 'primary' : 'secondary'}
                size="md"
                onPress={() => chooseStatus('in_progress')}
              />
              <Button
                label="Not started"
                variant={status === 'todo' ? 'primary' : 'secondary'}
                size="md"
                onPress={() => chooseStatus('todo')}
              />
              {members.length > 1 ? (
                <Button label="Back" variant="ghost" size="md" onPress={() => setStep('person')} />
              ) : null}
            </View>
          ) : null}
          {step === 'note' && person ? (
            <View style={styles.stack}>
              <Text variant="meta" color={colors.inkSoft}>
                Hand to {person.name} · {handoffStatusLabel(status)}
              </Text>
              <View style={styles.noteInputRow}>
                <TextInput
                  value={note}
                  onChangeText={(value) => setNote(value.slice(0, 2000))}
                  placeholder="e.g. Half done, waiting on the plumber"
                  placeholderTextColor={colors.inkFaint}
                  multiline
                  maxLength={2000}
                  style={styles.noteInput}
                />
                {dictation.available ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={dictation.listening ? 'Stop dictation' : 'Dictate a note'}
                    onPress={() => {
                      if (dictation.listening) dictation.stop();
                      else {
                        dictationBase.current = note;
                        dictation.start();
                      }
                    }}
                    style={styles.mic}
                  >
                    <Ionicons
                      name={dictation.listening ? 'stop' : 'mic-outline'}
                      size={18}
                      color={colors.inkSoft}
                    />
                  </Pressable>
                ) : null}
              </View>
              <Button label="Hand off" loading={busy} onPress={() => void finish(false)} />
              <Button label="Skip note" variant="secondary" size="md" disabled={busy} onPress={() => void finish(true)} />
              <Button label="Back" variant="ghost" size="md" onPress={() => setStep('status')} />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function TaskHandoffBlock({
  taskId,
  userId,
  fallback,
}: {
  taskId: string;
  userId: string | null;
  fallback: TaskHandoff | null;
}) {
  const { data: handoffs = [] } = useTaskHandoffs(taskId);
  const edit = useEditHandoffNote();
  const [openEarlier, setOpenEarlier] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const latest = handoffs[0] ?? fallback;
  if (!latest) return null;
  const earlier = handoffs.slice(1);
  const name = latest.from_name ?? 'Former member';
  const age = formatHandoffAge(latest.created_at);
  const canEdit = userId != null && latest.from_user_id === userId;

  return (
    <View style={styles.block}>
      <Text variant="meta" color={colors.inkSoft}>
        Handed over by {name}
        {age ? ` · ${age}` : ''} · {handoffStatusLabel(latest.status)}
      </Text>
      {editing ? (
        <View style={styles.stack}>
          <TextInput
            value={draft}
            onChangeText={(value) => setDraft(value.slice(0, 2000))}
            multiline
            maxLength={2000}
            style={styles.noteInput}
          />
          <Button
            label="Save note"
            size="md"
            loading={edit.isPending}
            onPress={() => {
              edit.mutate(
                { taskId, handoffId: latest.id, note: draft },
                { onSuccess: () => setEditing(false) },
              );
            }}
          />
        </View>
      ) : latest.note ? (
        <MarkdownNotes markdown={latest.note} />
      ) : null}
      {canEdit && !editing ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setDraft(latest.note ?? '');
            setEditing(true);
          }}
        >
          <Text variant="meta" color={colors.brandDeep}>
            Edit note
          </Text>
        </Pressable>
      ) : null}
      {earlier.length > 0 ? (
        <View style={styles.stack}>
          <Pressable accessibilityRole="button" onPress={() => setOpenEarlier((value) => !value)}>
            <Text variant="meta" color={colors.inkSoft}>
              {openEarlier ? 'Hide earlier handoffs' : `Earlier handoffs (${earlier.length})`}
            </Text>
          </Pressable>
          {openEarlier
            ? earlier.map((handoff) => <EarlierHandoff key={handoff.id} handoff={handoff} />)
            : null}
        </View>
      ) : null}
    </View>
  );
}

function EarlierHandoff({ handoff }: { handoff: TaskHandoff }) {
  const name = handoff.from_name ?? 'Former member';
  const age = formatHandoffAge(handoff.created_at);
  return (
    <View style={styles.earlier}>
      <Text variant="meta" color={colors.inkFaint}>
        {name}
        {age ? ` · ${age}` : ''} · {handoffStatusLabel(handoff.status)}
      </Text>
      {handoff.note ? <MarkdownNotes markdown={handoff.note} /> : null}
    </View>
  );
}

export function AgentLogSection({
  taskId,
  userId,
  canModerate,
}: {
  taskId: string;
  userId: string | null;
  canModerate: boolean;
}) {
  const { data: entries = [] } = useAgentLog(taskId);
  const remove = useDeleteAgentLogEntry();
  const [expanded, setExpanded] = useState(false);
  if (entries.length === 0) return null;
  const visible = expanded ? entries : entries.slice(0, 3);
  return (
    <View style={styles.block}>
      <Text variant="bodyMedium">Agent log</Text>
      {visible.map((entry) => (
        <AgentLogRowView
          key={entry.id}
          entry={entry}
          canDelete={canModerate || (userId != null && entry.author_id === userId)}
          onDelete={() => {
            void confirmDialog({
              title: 'Delete this log entry?',
              confirmLabel: 'Delete',
              destructive: true,
            }).then((ok) => {
              if (ok) remove.mutate({ taskId, entryId: entry.id });
            });
          }}
        />
      ))}
      {entries.length > 3 ? (
        <Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)}>
          <Text variant="meta" color={colors.inkSoft}>
            {expanded ? 'Show less' : `Show all (${entries.length})`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AgentLogRowView({
  entry,
  canDelete,
  onDelete,
}: {
  entry: AgentLogRow;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const name = entry.author?.display_name ?? 'Former member';
  const age = formatHandoffAge(entry.created_at);
  return (
    <Pressable
      onLongPress={canDelete ? onDelete : undefined}
      delayLongPress={400}
      accessibilityHint={canDelete ? 'Long press to delete' : undefined}
    >
      <View style={styles.logRow}>
        <Avatar name={name} uri={entry.author?.avatar_url} size={28} />
        <View style={styles.logCopy}>
          <Text variant="meta" color={colors.inkSoft}>
            {name}
            {age ? ` · ${age}` : ''}
          </Text>
          <MarkdownNotes markdown={entry.body} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteBar: { width: 2, alignSelf: 'stretch', borderRadius: 1 },
  noteCopy: { flex: 1 },
  noteName: { fontFamily: fonts.bodySemiBold, color: colors.ink },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40, 32, 24, 0.35)',
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  stack: { gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  noteInputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  noteInput: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    padding: spacing.md,
    color: colors.ink,
    fontFamily: fonts.bodyRegular,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  mic: { padding: spacing.sm },
  block: { gap: spacing.sm },
  earlier: { gap: spacing.xs, paddingLeft: spacing.sm },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  logCopy: { flex: 1, gap: spacing.xs },
});
