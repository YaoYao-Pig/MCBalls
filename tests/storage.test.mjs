import test from 'node:test';
import assert from 'node:assert/strict';
import { readSave, writeSave } from '../src/storage.js';

test('blocked or malformed storage cannot prevent a game from starting', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(readSave(blocked), { best: 0, muted: false, musicMuted: false });
  assert.equal(writeSave({ best: 100 }, blocked), false);
  assert.deepEqual(readSave({ getItem: () => '{broken' }), { best: 0, muted: false, musicMuted: false });
  assert.deepEqual(readSave({ getItem: () => 'null' }), { best: 0, muted: false, musicMuted: false });
});

test('valid best score and audio preference survive a storage round trip', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  assert.equal(writeSave({ best: 123.8, muted: true }, storage), true);
  assert.deepEqual(readSave(storage), { best: 123, muted: true, musicMuted: false });
  assert.deepEqual(readSave({ getItem: () => '{"best":-20}' }), { best: 0, muted: false, musicMuted: false });
});


test('music can be muted independently and older saves default to music enabled', () => {
  let value;
  const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  writeSave({ best: 4, muted: false, musicMuted: true }, storage);
  assert.deepEqual(readSave(storage), { best: 4, muted: false, musicMuted: true });
  assert.deepEqual(readSave({ getItem: () => '{"best":4,"muted":true}' }), { best: 4, muted: true, musicMuted: false });
});
