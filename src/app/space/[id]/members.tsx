import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { OptionChips } from '@/components/form';
import { Avatar } from '@/components/ui/Avatar';
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
import { useSpaces } from '@/data/spaces';
import { useAuth } from '@/providers/AuthProvider';
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
  owner: 'Created the space. Full control, including deleting it.',
  admin: 'Can add and remove people and invites, and change any task.',
  member: 'Can add, edit, and complete tasks in this space.',
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

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SpaceRole>('member');
  const [error, setError] = useState<string | null>(null);

  async function shareInvite(invite: Invite) {
    const url = Linking.createURL(`invite/${invite.token}`);
    await Share.share({
      message: `Join my space on Trove. Open this link on your phone: ${url}`,
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
      const invite = await createInvite.mutateAsync({ email: trimmed, role });
      setEmail('');
      await shareInvite(invite);
    } catch {
      setError('We could not create that invite. Try again.');
    }
  }

  function manageMember(member: RosterMember) {
    if (!manager || member.role === 'owner' || member.user_id === userId) return;
    Alert.alert(member.profile?.display_name ?? 'Member', 'Change role or remove from this space.', [
      { text: 'Make admin', onPress: () => updateRole.mutate({ memberId: member.id, role: 'admin' }) },
      { text: 'Make member', onPress: () => updateRole.mutate({ memberId: member.id, role: 'member' }) },
      { text: 'Make viewer', onPress: () => updateRole.mutate({ memberId: member.id, role: 'viewer' }) },
      { text: 'Remove', style: 'destructive', onPress: () => removeMember.mutate(member.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
          <Pressable
            key={m.id}
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
              </Text>
            </View>
            {manager && m.role !== 'owner' && m.user_id !== userId ? (
              <Text variant="meta" color={colors.brand}>
                Manage
              </Text>
            ) : null}
          </Pressable>
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
                  {ROLE_LABELS[inv.role as SpaceRole]} · pending
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
  section: { gap: spacing.sm },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  memberText: { flex: 1, gap: 2 },
});
