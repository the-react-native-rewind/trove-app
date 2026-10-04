import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APP_PATH, DEFAULT_SITE_URL, inviteUrl, openPageUrl } from './links';

test('invite links are https links to the website open page', () => {
  assert.equal(
    inviteUrl('4b614d9de2db1acc2486937e729090143fc42df3ee4ecd10'),
    `${DEFAULT_SITE_URL}/open?to=invite%2F4b614d9de2db1acc2486937e729090143fc42df3ee4ecd10`,
  );
  assert.equal(inviteUrl('abcdefghijklmnop', 'https://example.com/'), 'https://example.com/open?to=invite%2Fabcdefghijklmnop');
});

test('the bare open page opens the app', () => {
  assert.equal(openPageUrl(''), `${DEFAULT_SITE_URL}/open`);
  assert.equal(openPageUrl('/invite/abcdefghijklmnop'), `${DEFAULT_SITE_URL}/open?to=invite%2Fabcdefghijklmnop`);
});

test('only known app paths are allowed', () => {
  assert.equal(APP_PATH.test(''), true);
  assert.equal(APP_PATH.test('invite/abcdefghijklmnop'), true);
  assert.equal(APP_PATH.test('invite/short'), false);
  assert.equal(APP_PATH.test('https://evil.example'), false);
  assert.equal(APP_PATH.test('invite/abcdefghijklmnop/../x'), false);
});
