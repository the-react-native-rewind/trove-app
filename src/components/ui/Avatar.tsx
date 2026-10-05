import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/theme/tokens';
// Text is imported below.
import { Text } from './Text';

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({
  name,
  uri,
  size = 28,
  tint = colors.brandSoft,
}: {
  name: string | null | undefined;
  uri?: string | null;
  size?: number;
  tint?: string;
}) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityLabel={name ?? 'Member'}
      />
    );
  }
  return (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: tint },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.bodySemiBold,
          fontSize: size * 0.4,
          color: colors.brandDeep,
        }}
      >
        {initials(name)}
      </Text>
    </View>
  );
}

export function AvatarStack({
  people,
  size = 26,
  max = 3,
  ringColor = colors.surface,
}: {
  people: { id: string; display_name: string | null; avatar_url?: string | null }[];
  size?: number;
  max?: number;
  ringColor?: string;
}) {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View style={styles.stack} accessibilityElementsHidden>
      {shown.map((person, index) => (
        <View
          key={person.id}
          style={[
            styles.stackItem,
            {
              marginLeft: index === 0 ? 0 : -Math.round(size * 0.35),
              borderColor: ringColor,
              zIndex: shown.length - index,
            },
          ]}
        >
          <Avatar name={person.display_name} uri={person.avatar_url} size={size} />
        </View>
      ))}
      {extra > 0 ? (
        <Text variant="meta" color={colors.inkFaint} style={styles.extra}>
          +{extra}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stackItem: { borderWidth: 2, borderRadius: 999 },
  extra: { marginLeft: 4 },
});
