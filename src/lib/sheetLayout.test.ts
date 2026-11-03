import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sheetChrome, type SheetFrame } from './sheetLayout';

const IPHONE_13: SheetFrame = {
  screenHeight: 844,
  frameHeight: 844,
  topInset: 47,
  bottomInset: 34,
  leftInset: 0,
  rightInset: 0,
  keyboardHeight: 0,
  wide: false,
  contentGap: 16,
};

test('a full-screen sheet keeps one bottom inset and still bleeds the dim', () => {
  const chrome = sheetChrome(IPHONE_13);
  assert.equal(chrome.drop, 0);
  assert.equal(chrome.contentBottom, 34);
  assert.equal(chrome.keyboardLift, 0);
  assert.equal(chrome.bleedTop, 47);
  assert.equal(chrome.bleedBottom, 34);
  assert.ok(chrome.maxBodyHeight < 844);
});

test('a short modal frame pulls the sheet into the undimmed strip', () => {
  const chrome = sheetChrome({ ...IPHONE_13, frameHeight: 844 - 47 - 34 });
  assert.equal(chrome.drop, 34);
  assert.equal(chrome.contentBottom, 34);
  assert.equal(chrome.bleedBottom, 34);
});

test('the keyboard replaces the home-indicator inset', () => {
  const full = sheetChrome({ ...IPHONE_13, keyboardHeight: 336 });
  assert.equal(full.keyboardLift, 336);
  assert.equal(full.contentBottom, 16);
  assert.equal(full.drop, 0);
  assert.ok(full.maxBodyHeight < 844 - 336);

  const short = sheetChrome({ ...IPHONE_13, frameHeight: 763, keyboardHeight: 336 });
  assert.equal(short.keyboardLift, 336 - 34);
  assert.equal(short.contentBottom, 16);
  assert.equal(short.drop, 0);
});

test('a centered card does not add the home-indicator inset', () => {
  const chrome = sheetChrome({ ...IPHONE_13, wide: true, keyboardHeight: 320 });
  assert.equal(chrome.drop, 0);
  assert.equal(chrome.contentBottom, 16);
  assert.equal(chrome.keyboardLift, 320);
});
