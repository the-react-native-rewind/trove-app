import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ModalScaffold } from '@/components/ui/ModalScaffold';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useApiTokens, useCreateApiToken, useRevokeApiToken } from '@/data/apiTokens';
import { useOAuthGrants, useRevokeOAuthGrant } from '@/data/oauthGrants';
import { confirmDialog } from '@/lib/dialog';
import { describeScope } from '@/lib/oauthScopes';
import { colors, radii, spacing } from '@/theme/tokens';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://pxjqqogxemsmufopmlsv.supabase.co').replace(/\/$/, '');
const MCP_URL = (process.env.EXPO_PUBLIC_MCP_RESOURCE_URL ?? `${SUPABASE_URL}/functions/v1/mcp`).replace(/\/$/, '');

export default function ConnectAssistant() {
  const tokens = useApiTokens();
  const createToken = useCreateApiToken();
  const revokeToken = useRevokeApiToken();
  const grants = useOAuthGrants();
  const revokeGrant = useRevokeOAuthGrant();
  const [name, setName] = useState('');
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<'token' | 'url' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    setCopied(null);
    try {
      const token = await createToken.mutateAsync(name);
      setRevealed(token);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that token.');
    }
  }

  async function onCopy(value: string, which: 'token' | 'url') {
    await Clipboard.setStringAsync(value);
    setCopied(which);
  }

  async function onRevokeGrant(clientId: string, clientName: string) {
    const confirmed = await confirmDialog({
      title: `Disconnect ${clientName}?`,
      message: 'That assistant loses access until you approve it again. Personal tokens are not affected.',
      confirmLabel: 'Disconnect',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await revokeGrant.mutateAsync(clientId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect that app.');
    }
  }

  async function onRevoke(id: string, tokenName: string) {
    const confirmed = await confirmDialog({
      title: `Revoke ${tokenName}?`,
      message: 'Apps using this token will stop working immediately. This cannot be undone.',
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep',
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await revokeToken.mutateAsync(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that token.');
    }
  }

  return (
    <ModalScaffold title="Connect an AI assistant">
      <Text variant="body" color={colors.inkSoft}>
        A personal access token lets Claude, Cursor, ChatGPT, or another assistant create and
        manage tasks in your circles. It can do anything you can do in Trove, and nothing more.
      </Text>

      <View style={styles.block}>
        <Text variant="label" color={colors.inkSoft}>
          Server URL
        </Text>
        <Text variant="meta" color={colors.ink} selectable>
          {MCP_URL}
        </Text>
        <Button
          label={copied === 'url' ? 'Copied' : 'Copy server URL'}
          variant="secondary"
          size="md"
          onPress={() => onCopy(MCP_URL, 'url')}
        />
      </View>

      <TextField
        label="Token name"
        value={name}
        onChangeText={setName}
        placeholder="Claude on my laptop"
        autoCapitalize="sentences"
        helper="Only you can see tokens you create."
      />
      {error ? (
        <Text variant="meta" color={colors.priorityHigh}>
          {error}
        </Text>
      ) : null}
      <Button label="Create token" onPress={onCreate} loading={createToken.isPending} />

      {revealed ? (
        <View style={styles.reveal}>
          <Text variant="cardTitle">Copy this token now</Text>
          <Text variant="meta" color={colors.inkSoft}>
            Trove stores only a hash, so this is the only time it can be shown.
          </Text>
          <TextInput
            value={revealed}
            editable={false}
            selectTextOnFocus
            multiline
            style={styles.secret}
            accessibilityLabel="New API token"
          />
          <Button
            label={copied === 'token' ? 'Copied' : 'Copy token'}
            variant="secondary"
            onPress={() => onCopy(revealed, 'token')}
          />
        </View>
      ) : null}

      <View style={styles.list}>
        <Text variant="sectionHeading">Connected apps</Text>
        <Text variant="body" color={colors.inkSoft}>
          Assistants you approve with OAuth show up here. Revoking one signs that assistant out. A personal token is separate.
        </Text>
        {grants.isLoading ? (
          <Text variant="meta" color={colors.inkFaint}>
            Loading…
          </Text>
        ) : null}
        {grants.isError ? (
          <Text variant="meta" color={colors.inkFaint}>
            Connected apps appear after OAuth sign-in is turned on. Personal tokens still work.
          </Text>
        ) : null}
        {!grants.isLoading && !grants.isError && (grants.data ?? []).length === 0 ? (
          <Text variant="body" color={colors.inkFaint}>
            No connected apps yet.
          </Text>
        ) : null}
        {(grants.data ?? []).map((grant) => (
          <View key={grant.client.id} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text variant="bodyMedium">{grant.client.name || 'Assistant'}</Text>
              <Text variant="meta" color={colors.inkFaint}>
                {grant.scopes.map((scope) => describeScope(scope)).join(' · ') || 'Signed in as you'}
                {grant.granted_at ? ` · since ${formatWhen(grant.granted_at)}` : ''}
              </Text>
            </View>
            <Pressable
              onPress={() => onRevokeGrant(grant.client.id, grant.client.name || 'this app')}
              accessibilityRole="button"
              accessibilityLabel={`Disconnect ${grant.client.name || 'app'}`}
              style={styles.revoke}
            >
              <Text variant="meta" color={colors.priorityHigh}>
                Revoke
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.list}>
        <Text variant="sectionHeading">API tokens</Text>
        {tokens.isLoading ? (
          <Text variant="meta" color={colors.inkFaint}>
            Loading…
          </Text>
        ) : null}
        {(tokens.data ?? []).length === 0 && !tokens.isLoading ? (
          <Text variant="body" color={colors.inkFaint}>
            No active tokens yet.
          </Text>
        ) : null}
        {(tokens.data ?? []).map((token) => (
          <View key={token.id} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text variant="bodyMedium">{token.name}</Text>
              <Text variant="meta" color={colors.inkFaint}>
                {token.token_prefix}… · created {formatWhen(token.created_at)}
                {token.last_used_at ? ` · used ${formatWhen(token.last_used_at)}` : ' · not used yet'}
              </Text>
            </View>
            <Pressable
              onPress={() => onRevoke(token.id, token.name)}
              accessibilityRole="button"
              accessibilityLabel={`Revoke ${token.name}`}
              style={styles.revoke}
            >
              <Text variant="meta" color={colors.priorityHigh}>
                Revoke
              </Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ModalScaffold>
  );
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  reveal: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.brandSoft,
  },
  secret: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  list: { gap: spacing.md, marginTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  rowCopy: { flex: 1, gap: 2 },
  revoke: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
});
