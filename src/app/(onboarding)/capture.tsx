import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { OnboardingScaffold } from '@/components/onboarding/OnboardingScaffold';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSkipOnboarding } from '@/data/onboarding';
import { hapticLight } from '@/lib/haptics';
import {
  addLine,
  buildPlan,
  isEmptyPlan,
  keepChoices,
  ONBOARDING_CATEGORY_ORDER,
  ONBOARDING_LINE_MAX,
  removeLine,
  type OnboardingCategory,
  type OnboardingLists,
} from '@/lib/onboarding';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

import { useOnboardingDraft } from './_layout';

type CategoryCopy = {
  title: string;
  instruction: string;
  /** A second, quieter line under the instruction. */
  note: string;
  /** An example line, so the input shows how to answer. */
  example: string;
  /** Common answers that can be tapped instead of typed. */
  suggestions?: string[];
};

// The lists are a brain-dump: the point is to get everything out, not to get it tidy.
const DUMP_NOTE =
  'Don’t think about priority or when. Just get it out of your head. Trove will help you organise it later.';

const COPY: Record<OnboardingCategory, CategoryCopy> = {
  habits: {
    title: 'Routines',
    instruction: 'List everything you do every week.',
    note: 'Just name them. You’ll pick the days next.',
    example: 'Yoga',
    suggestions: ['Exercise', 'Walk', 'Read', 'Stretch', 'Meditate', 'Journal'],
  },
  work: {
    title: 'Work',
    instruction: 'List everything you need to do for work.',
    note: DUMP_NOTE,
    example: 'Reply to the client',
  },
  home: {
    title: 'Home',
    instruction: 'List everything that needs doing at home.',
    note: DUMP_NOTE,
    example: 'Fix the kitchen tap',
  },
  other: {
    title: 'Anything else',
    instruction: 'List everything else that’s on your mind.',
    note: DUMP_NOTE,
    example: 'Book the dentist',
  },
};

// Step 1 is the name; the four lists are steps 2 to 5.
const FIRST_LIST_STEP = 2;

/**
 * The four lists: Routines, Work, Home, Anything else. Every step works the same
 * way — type a thing, press return, repeat — so there is one thing to learn.
 * Which list a line is typed under says what it becomes, so nothing is guessed.
 */
export default function OnboardingCapture() {
  const router = useRouter();
  const draft = useOnboardingDraft();
  const skip = useSkipOnboarding();
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardWillShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardWillHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const category = ONBOARDING_CATEGORY_ORDER[index];
  const copy = COPY[category];
  const lines = draft.lists[category];
  const isLast = index === ONBOARDING_CATEGORY_ORDER.length - 1;
  const pending = text.trim().length > 0;
  const suggestions = (copy.suggestions ?? []).filter(
    (suggestion) => !lines.some((line) => line.toLowerCase() === suggestion.toLowerCase()),
  );

  function withLine(lists: OnboardingLists, raw: string): OnboardingLists {
    const next = addLine(lists[category], raw);
    return next === lists[category] ? lists : { ...lists, [category]: next };
  }

  function add(raw: string) {
    const next = withLine(draft.lists, raw);
    if (next !== draft.lists) {
      hapticLight();
      draft.setLists(next);
    }
  }

  // `raw` comes straight from the box on return, so a quick return never acts
  // on text the screen has not caught up with yet.
  function submitLine(raw: string = text) {
    // Return on an empty box means "that's the lot": put the keyboard away,
    // which brings Continue back into view.
    if (!raw.trim()) {
      Keyboard.dismiss();
      return;
    }
    add(raw);
    setText('');
  }

  function remove(line: string) {
    hapticLight();
    draft.setLists({ ...draft.lists, [category]: removeLine(lines, line) });
  }

  async function onNext() {
    // Whatever is still in the box counts.
    const lists = withLine(draft.lists, text);
    if (lists !== draft.lists) draft.setLists(lists);
    setText('');
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    const plan = buildPlan(lists);
    if (isEmptyPlan(plan)) {
      // Nothing listed anywhere: there is no day to show, so head straight in.
      setBusy(true);
      await skip.mutateAsync();
      router.replace('/');
      return;
    }
    // Coming back through after a look at the review keeps what was chosen there.
    draft.setPlan(keepChoices(draft.plan, plan));
    router.push('/(onboarding)/review' as never);
  }

  function onBack() {
    setText('');
    // From the first list, back is the name step, which can exit onboarding.
    if (index === 0) router.back();
    else setIndex(index - 1);
  }

  const hasAnything = lines.length > 0 || pending;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <OnboardingScaffold
        step={FIRST_LIST_STEP + index}
        align="top"
        onBack={onBack}
        footer={
          // Continue sits at the bottom of the screen, so the keyboard covers it
          // while a list is being typed. Nothing below the box can be tapped by
          // mistake, and the list gets the room.
          keyboardUp ? undefined : (
            <View style={styles.footer}>
              <Button
                label="Continue"
                onPress={onNext}
                disabled={!hasAnything}
                loading={busy && hasAnything}
              />
              {/* Skip keeps its space when hidden, so adding the first line
                  does not shift the box and the button down the screen. */}
              <Pressable
                onPress={onNext}
                disabled={busy || hasAnything}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityElementsHidden={hasAnything}
                importantForAccessibility={hasAnything ? 'no-hide-descendants' : 'auto'}
                style={[styles.footerLink, hasAnything && styles.hidden]}
              >
                <Text variant="meta" color={colors.inkSoft}>
                  Skip
                </Text>
              </Pressable>
            </View>
          )
        }
      >
        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => {
            // Follow the list as it grows, but never scroll the title away on an empty step.
            if (lines.length > 0) scrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <Animated.View key={category} entering={FadeIn.duration(220)}>
            <Text style={styles.heading}>{copy.title}</Text>
            <Text style={styles.instruction}>{copy.instruction}</Text>
            <Text variant="body" color={colors.inkSoft} style={styles.note}>
              {copy.note}
            </Text>

            {suggestions.length > 0 ? (
              <View style={styles.chips}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => add(suggestion)}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${suggestion}`}
                    style={styles.chip}
                  >
                    <Ionicons name="add" size={18} color={colors.inkSoft} />
                    <Text variant="bodyMedium" color={colors.ink}>
                      {suggestion}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <View style={styles.lines}>
              {lines.map((line) => (
                <Animated.View key={line} entering={FadeIn.duration(160)} style={styles.line}>
                  <Text variant="body" color={colors.ink} style={styles.lineText}>
                    {line}
                  </Text>
                  <Pressable
                    onPress={() => remove(line)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${line}`}
                    style={styles.lineRemove}
                  >
                    <Ionicons name="close" size={18} color={colors.inkFaint} />
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={lines.length === 0 ? `e.g. ${copy.example}` : 'Add another'}
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="sentences"
            maxLength={ONBOARDING_LINE_MAX}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={(event) => submitLine(event.nativeEvent.text)}
            style={styles.input}
          />
          <Pressable
            onPress={() => submitLine()}
            disabled={!pending}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add to the list"
            style={[styles.addBtn, !pending && styles.addBtnOff]}
          >
            <Ionicons name="arrow-up" size={18} color={colors.onBrand} />
          </Pressable>
        </View>
        {keyboardUp ? (
          <View style={styles.hintRow}>
            <Text variant="meta" color={colors.inkFaint} style={styles.hint}>
              Press return after each one.
            </Text>
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close the keyboard"
            >
              <Text variant="meta" color={colors.brand}>
                Done
              </Text>
            </Pressable>
          </View>
        ) : null}
      </OnboardingScaffold>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.paper },
  scroll: { paddingTop: spacing.sm, paddingBottom: spacing.md },
  heading: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 32,
    lineHeight: 39,
    color: colors.ink,
  },
  instruction: {
    marginTop: spacing.sm,
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 25,
    color: colors.ink,
  },
  note: { marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 40,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  lines: { marginTop: spacing.lg },
  line: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  lineText: { flex: 1, paddingVertical: spacing.sm },
  lineRemove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radii.card,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md + 2,
    fontFamily: fonts.bodyRegular,
    fontSize: 17,
    color: colors.ink,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnOff: { backgroundColor: colors.hairline },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  hint: { flex: 1 },
  footer: { gap: spacing.xs },
  hidden: { opacity: 0 },
  footerLink: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
});
