import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useProfile, useUpdateProfile } from '@/data/profile';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme/tokens';

export default function Account() {
  const { session, signOut } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();

  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile?.display_name) setName(profile.display_name);
  }, [profile?.display_name]);

  async function onSaveName() {
    if (!name.trim() || name === profile?.display_name) return;
    await updateProfile.mutateAsync({ display_name: name });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <ModalScaffold title="Account">
      <View style={styles.identity}>
        <Avatar name={name || profile?.display_name} uri={profile?.avatar_url} size={72} />
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

      <View style={styles.actions}>
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </ModalScaffold>
  );
}

const styles = StyleSheet.create({
  identity: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  actions: { marginTop: spacing.xl },
});
