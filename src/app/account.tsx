import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { pickAvatarImage, useProfile, useUpdateProfile, useUploadAvatar } from '@/data/profile';
import { alertDialog, confirmDialog } from '@/lib/dialog';
import { hapticLight } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radii, spacing } from '@/theme/tokens';

export default function Account() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();

  const profileName = profile?.display_name ?? '';
  const [name, setName] = useState(profileName);
  const [seenName, setSeenName] = useState(profileName);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (profileName !== seenName) {
    setSeenName(profileName);
    setName(profileName);
  }

  async function onSaveName() {
    if (!name.trim() || name === profile?.display_name) return;
    await updateProfile.mutateAsync({ display_name: name });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function onChangePhoto() {
    try {
      const uri = await pickAvatarImage();
      if (!uri) return;
      await uploadAvatar.mutateAsync(uri);
    } catch (e) {
      alertDialog('Upload failed', e instanceof Error ? e.message : 'Please try again.');
    }
  }

  async function onDeleteAccount() {
    const confirmed = await confirmDialog({
      title: 'Delete your account?',
      message:
        'Your personal circle goes with you. Circles you own are handed to another member, or deleted if you are the only person in them. This cannot be undone.',
      confirmLabel: 'Delete account',
      cancelLabel: 'Keep account',
      destructive: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      setDeleting(false);
      alertDialog('Could not delete account', error.message);
      return;
    }
    await signOut();
  }

  const uploading = uploadAvatar.isPending;

  return (
    <ModalScaffold title="Account">
      <View style={styles.identity}>
        <Pressable
          onPress={onChangePhoto}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Change profile photo"
          accessibilityState={{ busy: uploading }}
          style={styles.avatarButton}
        >
          <View>
            <Avatar name={name || profile?.display_name} uri={profile?.avatar_url} size={72} />
            {uploading ? (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color={colors.onBrand} />
              </View>
            ) : null}
          </View>
          <Text variant="meta" color={colors.brand}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </Text>
        </Pressable>
        <Text variant="meta" color={colors.inkFaint}>
          {session?.user.email}
        </Text>
      </View>

      <TextField
        label="Display name"
        value={name}
        onChangeText={setName}
        onEndEditing={onSaveName}
        placeholder="Your name"
        autoCapitalize="words"
        helper={saved ? 'Saved' : 'This is how your people see you.'}
      />

      <View style={styles.beta}>
        <Text variant="sectionHeading">Beta features</Text>
        <Text variant="body" color={colors.inkSoft}>
          These are still settling in. They stay off for anyone you invite until that person turns
          them on here.
        </Text>
        <View style={styles.betaRow}>
          <View style={styles.betaCopy}>
            <Text variant="bodyMedium">My Week</Text>
            <Text variant="meta" color={colors.inkFaint}>
              A private weekly plan, kept apart from the shared list.
            </Text>
          </View>
          <Switch
            value={profile?.my_week_enabled === true}
            disabled={!profile || updateProfile.isPending}
            onValueChange={(value) => {
              hapticLight();
              updateProfile.mutate(
                { my_week_enabled: value },
                {
                  onError: (error) => {
                    alertDialog(
                      'Could not save',
                      error instanceof Error ? error.message : 'Please try again.',
                    );
                  },
                },
              );
            }}
            trackColor={{ false: colors.hairline, true: colors.brand }}
            thumbColor={colors.surface}
            ios_backgroundColor={colors.hairline}
            accessibilityLabel="My Week beta"
          />
        </View>
      </View>

      <View style={styles.connect}>
        <Text variant="sectionHeading">Connect an AI assistant</Text>
        <Text variant="body" color={colors.inkSoft}>
          Approve an assistant when it asks to sign in, or create a personal token, so Claude, Cursor, or ChatGPT can work with your circles and tasks.
        </Text>
        <Button
          label="API tokens"
          variant="secondary"
          onPress={() => router.push('/connect')}
        />
      </View>

      <View style={styles.actions}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
        <Button
          label="Delete account"
          variant="danger"
          onPress={onDeleteAccount}
          loading={deleting}
        />
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  avatarButton: { alignItems: 'center', gap: spacing.xs },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: 'rgba(43, 38, 32, 0.35)',
  },
  beta: { marginTop: spacing.xl, gap: spacing.md },
  betaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  betaCopy: { flex: 1, gap: spacing.xs },
  connect: { marginTop: spacing.xl, gap: spacing.md },
  actions: { marginTop: spacing.xl, gap: spacing.md },
});
