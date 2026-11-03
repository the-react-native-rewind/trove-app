import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { OptionChips } from '@/components/form';
import { Avatar } from '@/components/ui/Avatar';
import { AccentDot } from '@/components/ui/Indicators';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  useCreateInvite,
  usePendingInvites,
  useRemoveMember,
  useRevokeInvite,
  useRoster,
  useUpdateMemberRole,
} from '@/data/members';
import { useProjectMembers, useProjects, useSetMemberProjects } from '@/data/projects';
import { useSpaces } from '@/data/spaces';
import { useAuth } from '@/providers/AuthProvider';
import { inviteUrl } from '@/lib/links';
import {
  canManage,
  ROLE_LABELS,
  type Invite,
  type RosterMember,
  type SpaceRole,
} from '@/lib/types';
import { colors, radii, spacing } from '@/theme/tokens';

const INVITE_ROLES: { value: SpaceRole; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
  { value: 'viewer', label: 'Viewer' },
];

const ROLE_DESCRIPTIONS: Record<SpaceRole, string> = {
  owner: 'Created the circle. Full control, including deleting it.',
  admin: 'Can add and remove people and invites, and change any task.',
  member: 'Can add, edit, and complete tasks in this circle.',
  viewer: 'Can see the board but not change anything.',
};

export default function Members() {
  const { id: spaceId } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { data: spaces = [] } = useSpaces();
  const myRole = spaces.find((s) => s.id === spaceId)?.role;
  const manager = canManage(myRole);

  const { data: roster = [] } = useRoster(spaceId);
  const { data: invites = [] } = usePendingInvites(spaceId);
  const createInvite = useCreateInvite(spaceId);
  const revokeInvite = useRevokeInvite(spaceId);
  const updateRole = useUpdateMemberRole(spaceId);
  const removeMember = useRemoveMember(spaceId);
  const { data: projects = [] } = useProjects(spaceId);
  const { data: projectMembers = [] } = useProjectMembers(spaceId);
  const setMemberProjects = useSetMemberProjects(spaceId);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SpaceRole>('member');
  const [agent, setAgent] = useState(false);
  const [inviteProjects, setInviteProjects] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);

  async function shareInvite(invite: Invite) {
    // https, not trove://: chat apps and email do not make trove:// tappable,
    // and the web page offers the download to people without Trove.
    const url = inviteUrl(invite.token);
    await Share.share({
      message: `Join my circle on Trove: ${url}`,
    });
  }

  async function onInvite() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    try {
      const invite = await createInvite.mutateAsync({
        email: trimmed,
        role,
        isAgent: agent,
        projectIds: inviteProjects,
      });
      setEmail('');
      setAgent(false);
      setInviteProjects([]);
      await shareInvite(invite);
    } catch {
      setError('We could not create that invite. Try again.');
    }
  }

  function manageMember(member: RosterMember) {
    if (!manager || member.role === 'owner' || member.user_id === userId) return;
    setManagingId((current) => (current === member.id ? null : member.id));
  }

  return (
    <ModalScaffold title="Members">
      {manager ? (
        <View style={styles.inviteCard}>
          <Text variant="cardTitle">Invite by email</Text>
          <Text variant="meta" color={colors.inkFaint}>
            Free, no per-person cost. They join the moment they open the link.
          </Text>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="friend@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <OptionChips label="Role" options={INVITE_ROLES} value={role} onChange={setRole} />
          <Text variant="meta" color={colors.inkSoft} style={styles.roleHint}>
            {ROLE_DESCRIPTIONS[role]}
          </Text>
          <Pressable
            onPress={() => setAgent((current) => !current)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agent }}
            accessibilityLabel="This invite is for an agent"
            style={styles.agentToggle}
          >
            <Ionicons
              name={agent ? 'checkbox' : 'square-outline'}
              size={22}
              color={agent ? colors.brandDeep : colors.inkSoft}
            />
            <View style={styles.memberText}>
              <Text variant="bodyMedium">This invite is for an agent</Text>
              <Text variant="meta" color={colors.inkFaint}>
                Agents are bots. People stay the default.
              </Text>
            </View>
          </Pressable>
          {projects.length > 0 ? (
            <View style={styles.projectBlock}>
              <Text variant="label" color={colors.inkFaint}>
                Projects
              </Text>
              <Text variant="meta" color={colors.inkFaint}>
                Optional. Leave them off and they see the whole circle. Pick one or more to limit
                them, including an agent, to those projects.
              </Text>
              <View style={styles.manageRow}>
                {projects.map((project) => {
                  const on = inviteProjects.includes(project.id);
                  return (
                    <Pressable
                      key={project.id}
                      onPress={() =>
                        setInviteProjects((current) =>
                          current.includes(project.id)
                            ? current.filter((id) => id !== project.id)
                            : [...current, project.id],
                        )
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[styles.manageChip, on && styles.manageChipOn]}
                    >
                      <AccentDot color={project.color} size={8} />
                      <Text variant="meta" color={on ? colors.brandDeep : colors.inkSoft}>
                        {project.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          {error ? (
            <Text variant="meta" color={colors.priorityHigh}>
              {error}
            </Text>
          ) : null}
          <Button label="Create invite link" onPress={onInvite} loading={createInvite.isPending} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Text variant="label" color={colors.inkFaint}>
          People
        </Text>
        {roster.map((m) => (
          <View key={m.id}>
          <Pressable
            onPress={() => manageMember(m)}
            style={styles.memberRow}
            accessibilityRole={manager ? 'button' : 'text'}
          >
            <Avatar name={m.profile?.display_name} uri={m.profile?.avatar_url} size={38} />
            <View style={styles.memberText}>
              <Text variant="bodyMedium" numberOfLines={1}>
                {m.profile?.display_name ?? 'Member'}
                {m.user_id === userId ? ' (you)' : ''}
              </Text>
              <Text variant="meta" color={colors.inkFaint}>
                {ROLE_LABELS[m.role as SpaceRole]}
                {m.is_agent ? ' · Agent' : ''}
              </Text>
            </View>
            {manager && m.role !== 'owner' && m.user_id !== userId ? (
              <Text variant="meta" color={colors.brand}>
                {managingId === m.id ? 'Close' : 'Manage'}
              </Text>
            ) : null}
          </Pressable>
          {managingId === m.id ? (
            <View style={styles.manageRow}>
              {(['admin', 'member', 'viewer'] as SpaceRole[]).map((nextRole) => (
                <Pressable
                  key={nextRole}
                  onPress={() => {
                    updateRole.mutate({ memberId: m.id, role: nextRole });
                    setManagingId(null);
                  }}
                  style={styles.manageChip}
                >
                  <Text variant="meta" color={colors.brandDeep}>
                    {ROLE_LABELS[nextRole]}
                  </Text>
                </Pressable>
              ))}
              {projects.length > 0 ? (
                <View style={styles.projectBlock}>
                  <Text variant="meta" color={colors.inkFaint}>
                    Projects. All off means the whole circle.
                  </Text>
                  <View style={styles.manageRow}>
                    {projects.map((project) => {
                      const selected = projectMembers.some(
                        (row) => row.user_id === m.user_id && row.project_id === project.id,
                      );
                      return (
                        <Pressable
                          key={project.id}
                          onPress={() => {
                            const current = projectMembers
                              .filter((row) => row.user_id === m.user_id)
                              .map((row) => row.project_id);
                            const next = selected
                              ? current.filter((id) => id !== project.id)
                              : [...current, project.id];
                            setMemberProjects.mutate({ userId: m.user_id, projectIds: next });
                          }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          style={[styles.manageChip, selected && styles.manageChipOn]}
                        >
                          <AccentDot color={project.color} size={8} />
                          <Text variant="meta" color={selected ? colors.brandDeep : colors.inkSoft}>
                            {project.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              <Pressable
                onPress={() => {
                  removeMember.mutate(m.id);
                  setManagingId(null);
                }}
                style={styles.manageChip}
              >
                <Text variant="meta" color={colors.priorityHigh}>
                  Remove
                </Text>
              </Pressable>
            </View>
          ) : null}
          </View>
        ))}
      </View>

      {manager && invites.length > 0 ? (
        <View style={styles.section}>
          <Text variant="label" color={colors.inkFaint}>
            Pending invites
          </Text>
          {invites.map((inv) => (
            <View key={inv.id} style={styles.memberRow}>
              <View style={styles.memberText}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {inv.email}
                </Text>
                <Text variant="meta" color={colors.inkFaint}>
                  {ROLE_LABELS[inv.role as SpaceRole]}
                  {inv.is_agent ? ' · Agent' : ''} · pending
                </Text>
              </View>
              <Pressable onPress={() => shareInvite(inv)} hitSlop={8}>
                <Text variant="meta" color={colors.brand}>
                  Share
                </Text>
              </Pressable>
              <Pressable onPress={() => revokeInvite.mutate(inv.id)} hitSlop={8}>
                <Text variant="meta" color={colors.priorityHigh}>
                  Revoke
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  inviteCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    gap: spacing.md,
  },
  roleHint: { marginTop: -spacing.xs, marginLeft: 2 },
  agentToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { gap: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberText: { flex: 1, gap: 2 },
  manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingLeft: 50 },
  manageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
  },
  manageChipOn: { backgroundColor: colors.brandSoft },
  projectBlock: { width: '100%', gap: spacing.xs },
});
