import { Linking, Platform } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';

import { httpLinkUrl } from '@/lib/markdown';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

const mono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default:
    'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
});

const noteStyle: MarkdownStyle = {
  paragraph: {
    fontFamily: fonts.bodyRegular,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 10,
  },
  h1: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.ink,
    marginBottom: 8,
  },
  h2: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 19,
    lineHeight: 24,
    color: colors.ink,
    marginBottom: 8,
  },
  h3: {
    fontFamily: fonts.displaySemiBold,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 6,
  },
  h4: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 6,
  },
  h5: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.ink,
    marginBottom: 4,
  },
  h6: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
    marginBottom: 4,
  },
  strong: { fontFamily: fonts.bodyBold, fontWeight: 'normal', color: colors.ink },
  em: { color: colors.ink },
  link: { fontFamily: fonts.bodyMedium, color: colors.brandDeep, underline: true },
  list: {
    fontFamily: fonts.bodyRegular,
    fontSize: 15.5,
    lineHeight: 22,
    color: colors.ink,
    bulletColor: colors.brand,
    markerColor: colors.brandDeep,
    marginBottom: 10,
    itemSpacing: 4,
  },
  taskList: {
    checkedColor: colors.brand,
    borderColor: colors.inkFaint,
    checkmarkColor: colors.onBrand,
    checkboxSize: 18,
    checkboxBorderRadius: 4,
    checkedTextColor: colors.inkSoft,
    checkedStrikethrough: false,
  },
  blockquote: {
    borderColor: colors.brand,
    borderWidth: 3,
    backgroundColor: colors.surfaceAlt,
    color: colors.inkSoft,
    fontFamily: fonts.bodyRegular,
    fontSize: 15.5,
    lineHeight: 22,
    padding: spacing.md,
    marginBottom: 10,
  },
  code: {
    fontFamily: mono,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.hairline,
  },
  codeBlock: {
    fontFamily: mono,
    fontSize: 13,
    lineHeight: 20,
    color: '#F3F4F6',
    backgroundColor: colors.ink,
    borderColor: '#3A342C',
    borderRadius: radii.sm,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
    syntaxColors: {
      keyword: '#FF7B72',
      operator: '#F3F4F6',
      punctuation: '#F3F4F6',
      string: '#A5D6FF',
      number: '#79C0FF',
      constant: '#79C0FF',
      comment: '#C9BCA4',
      function: '#D2A8FF',
      type: '#FFA657',
      variable: '#F3F4F6',
      property: '#79C0FF',
      tag: '#7EE787',
      attribute: '#79C0FF',
      embedded: '#F3F4F6',
    },
  },
};

/**
 * Read-only notes. Editing stays plain text. Single newlines stay line breaks
 * so notes imported from Notion do not collapse into one paragraph. GitHub
 * flavor draws task-list checkboxes and keeps fenced code in a monospace block.
 */
export function MarkdownNotes({ markdown }: { markdown: string }) {
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      flavor="github"
      enableTaskListItemToggle={false}
      allowTrailingMargin={false}
      md4cFlags={{ hardSoftBreaks: true, latexMath: false }}
      markdownStyle={noteStyle}
      onLinkPress={({ url }) => {
        const safe = httpLinkUrl(url);
        if (safe) void Linking.openURL(safe);
      }}
    />
  );
}
