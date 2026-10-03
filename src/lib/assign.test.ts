import assert from 'node:assert/strict';
import { test } from 'node:test';

import { peopleInEveryCircle, uniqueSpaceIds, type AssignablePerson } from './assign';

const alex: AssignablePerson = { userId: 'alex', displayName: 'Alex', avatarUrl: null };
const sam: AssignablePerson = { userId: 'sam', displayName: 'Sam', avatarUrl: null };
const priya: AssignablePerson = { userId: 'priya', displayName: 'Priya', avatarUrl: null };

test('one circle offers everyone in it', () => {
  assert.deepEqual(peopleInEveryCircle([[priya, alex, sam]]), [alex, priya, sam]);
});

test('several circles offer only people who belong to all of them', () => {
  assert.deepEqual(
    peopleInEveryCircle([
      [alex, sam, priya],
      [sam, alex],
    ]),
    [alex, sam],
  );
});

test('nobody in every circle yields an empty list', () => {
  assert.deepEqual(
    peopleInEveryCircle([
      [alex, priya],
      [sam],
    ]),
    [],
  );
});

test('duplicate roster rows count once', () => {
  assert.deepEqual(peopleInEveryCircle([[alex, alex]]), [alex]);
});

test('space ids stay unique and in first-seen order', () => {
  assert.deepEqual(
    uniqueSpaceIds([{ space_id: 'garden' }, { space_id: 'choir' }, { space_id: 'garden' }]),
    ['garden', 'choir'],
  );
});
