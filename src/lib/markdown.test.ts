import assert from 'node:assert/strict';
import { test } from 'node:test';

import { httpLinkUrl, plainTextFromMarkdown } from './markdown';

test('plain text drops markdown markers and keeps the words', () => {
  const source = [
    '## Market list',
    'Buy **flour** and *yeast*',
    '- [ ] Sourdough starter',
    '- [x] Honey',
    '1. Call the mill',
    'See [the mill](https://example.com/mill)',
    'Use `50g` of salt',
    '```',
    '  const fold = true',
    '```',
  ].join('\n');

  assert.equal(
    plainTextFromMarkdown(source),
    'Market list Buy flour and yeast Sourdough starter Honey Call the mill See the mill Use 50g of salt const fold = true',
  );
});

test('single newlines in a note preview as spaces, blank lines do not add markers', () => {
  assert.equal(plainTextFromMarkdown('Line one\nLine two\n\nLine three'), 'Line one Line two Line three');
});

test('an empty note previews as nothing', () => {
  assert.equal(plainTextFromMarkdown(''), '');
  assert.equal(plainTextFromMarkdown('   \n```\n\n```'), '');
});

test('only http and https links are openable', () => {
  assert.equal(httpLinkUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(httpLinkUrl('http://example.com'), 'http://example.com/');
  assert.equal(httpLinkUrl('javascript:alert(1)'), null);
  assert.equal(httpLinkUrl('trove://task'), null);
  assert.equal(httpLinkUrl('not a url'), null);
});
