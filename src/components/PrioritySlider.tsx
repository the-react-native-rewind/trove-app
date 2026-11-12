import { useEffect, useRef, useState, type ComponentProps, type ComponentType } from 'react';
import { Platform, StyleSheet, View, type GestureResponderEvent, type ViewStyle } from 'react-native';

import { hapticSelection } from '@/lib/haptics';
import { importanceLabel } from '@/lib/importance';
import { clampImportance, countPlacementRanks } from '@/lib/rank';
import { colors, importanceColor, radii, shadows, spacing } from '@/theme/tokens';
import { FieldLabel } from './form';
import { Text } from './ui/Text';

const THUMB = 26;
const HIT = 44;
const SEGMENTS = 28;
const SEGMENT_COLORS = Array.from({ length: SEGMENTS }, (_, index) =>
  importanceColor(index / (SEGMENTS - 1)),
);

type Props = {
  value: number;
  onChange: (importance: number) => void;
  /** Open ranks this action will be placed among. Drives the live label. */
  peerRanks: readonly string[];
};

/**
 * Calm-to-urgent slider for where a new action sits in the list.
 * The track uses the same heat ramp as the urgency dots: warm neutral,
 * then honey, then terracotta. Drag, tap, keyboard, and the adjustable
 * accessibility actions all work on iOS, macOS, and web.
 */
export function PrioritySlider({ value, onChange, peerRanks }: Props) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [tipWidth, setTipWidth] = useState(0);
  const label = importanceLabel(value, peerRanks);
  const thumbColor = importanceColor(value);
  const labelRef = useRef(label);
  const valueRef = useRef(value);

  useEffect(() => {
    labelRef.current = label;
    valueRef.current = value;
  }, [label, value]);

  function publish(next: number) {
    const clamped = clampImportance(next);
    const nextLabel = importanceLabel(clamped, peerRanks);
    if (nextLabel !== labelRef.current) {
      labelRef.current = nextLabel;
      hapticSelection();
    }
    valueRef.current = clamped;
    if (clamped !== value) onChange(clamped);
  }

  function publishFromX(locationX: number) {
    if (trackWidth <= 0) return;
    publish(locationX / trackWidth);
  }

  function stepBy(direction: -1 | 1 | 'start' | 'end') {
    if (direction === 'start') {
      publish(0);
      return;
    }
    if (direction === 'end') {
      publish(1);
      return;
    }
    const step = 1 / Math.max(countPlacementRanks(peerRanks) + 1, 2);
    publish(valueRef.current + direction * step);
  }

  function onGrant(event: GestureResponderEvent) {
    publishFromX(event.nativeEvent.locationX);
  }

  const tipShift =
    trackWidth <= 0 || tipWidth <= 0
      ? 0
      : Math.min(Math.max(0, value * trackWidth - tipWidth / 2), Math.max(0, trackWidth - tipWidth));

  return (
    <View style={styles.field}>
      <FieldLabel>Importance</FieldLabel>
      <View style={styles.tipLane} pointerEvents="none">
        <View
          onLayout={(event) => setTipWidth(event.nativeEvent.layout.width)}
          style={[styles.tip, { transform: [{ translateX: tipShift }] }]}
        >
          <View style={[styles.tipDot, { backgroundColor: thumbColor }]} />
          <Text variant="meta" color={colors.ink}>
            {label}
          </Text>
        </View>
      </View>
      <FocusTrack
        style={[styles.hit, webHit]}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onGrant}
        tabIndex={0}
        onKeyDown={(event) => {
          const key = event.nativeEvent.key;
          if (key === 'ArrowRight' || key === 'ArrowUp') {
            event.preventDefault();
            stepBy(1);
          } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
            event.preventDefault();
            stepBy(-1);
          } else if (key === 'Home') {
            event.preventDefault();
            stepBy('start');
          } else if (key === 'End') {
            event.preventDefault();
            stepBy('end');
          }
        }}
        accessibilityRole="adjustable"
        accessibilityLabel="Importance"
        accessibilityHint="Left is the least important action, at the bottom of the list. Right is the most important, at the top."
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(clampImportance(value) * 100),
          text: label,
        }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') stepBy(1);
          if (event.nativeEvent.actionName === 'decrement') stepBy(-1);
        }}
      >
        <View style={styles.track} pointerEvents="none">
          {SEGMENT_COLORS.map((color, index) => (
            <View key={index} style={[styles.segment, { backgroundColor: color }]} />
          ))}
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            {
              backgroundColor: thumbColor,
              left: trackWidth > 0 ? value * trackWidth - THUMB / 2 : 0,
            },
          ]}
        />
      </FocusTrack>
      <View style={styles.ends} pointerEvents="none">
        <Text variant="meta" color={colors.inkFaint}>
          Least important
        </Text>
        <Text variant="meta" color={colors.inkFaint}>
          Most important
        </Text>
      </View>
    </View>
  );
}

const webHit: ViewStyle | null =
  Platform.OS === 'web' ? ({ cursor: 'pointer', userSelect: 'none' } as ViewStyle) : null;

type KeyDown = { preventDefault: () => void; nativeEvent: { key: string } };

/** View's public props omit keyboard events that web and macOS still deliver. */
const FocusTrack = View as ComponentType<ComponentProps<typeof View> & { onKeyDown?: (event: KeyDown) => void }>;

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  tipLane: { height: 36, justifyContent: 'flex-end' },
  tip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    ...shadows.card,
  },
  tipDot: { width: 8, height: 8, borderRadius: 4 },
  hit: { height: HIT, justifyContent: 'center' },
  track: {
    height: 14,
    borderRadius: radii.pill,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.priorityLow,
  },
  segment: { flex: 1 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: colors.surface,
    top: (HIT - THUMB) / 2,
    ...shadows.floating,
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
});
