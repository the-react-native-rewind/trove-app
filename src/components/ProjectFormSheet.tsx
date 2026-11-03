import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useCreateProject } from '@/data/projects';
import { colors, radii, spacing } from '@/theme/tokens';
import { ColorPicker } from './form';
import { Button } from './ui/Button';
import { FadeSheet, SheetBottom } from './ui/FadeSheet';
import { Text } from './ui/Text';
import { TextField } from './ui/TextField';

export function ProjectFormSheet({
  visible,
  spaceId,
  onClose,
}: {
  visible: boolean;
  spaceId: string;
  onClose: () => void;
}) {
  const create = useCreateProject(spaceId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('sage');
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(visible);
  if (visible && !wasOpen) {
    setWasOpen(true);
    setName('');
    setDescription('');
    setColor('sage');
    setError(null);
  } else if (!visible && wasOpen) {
    setWasOpen(false);
  }

  async function onCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the project a name.');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        name: trimmed,
        color,
        description: description.trim() || null,
      });
      onClose();
    } catch {
      setError('Could not create that project. Try again.');
    }
  }

  return (
    <FadeSheet visible={visible} onClose={onClose} scroll>
      <SheetBottom style={styles.sheet}>
        <Text variant="sectionHeading">New project</Text>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Greenhouse"
          autoFocus
        />
        <TextField
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Optional"
        />
        <ColorPicker value={color} onChange={setColor} />
        {error ? (
          <Text variant="meta" color={colors.priorityHigh}>
            {error}
          </Text>
        ) : null}
        <Button label="Create project" onPress={() => void onCreate()} loading={create.isPending} />
      </SheetBottom>
    </FadeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
});
