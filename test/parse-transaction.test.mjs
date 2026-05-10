import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDdMmYy, signedIntegerAmount } from '../src/parse-transaction.js';

test('parseDdMmYy', () => {
  assert.equal(parseDdMmYy('10-05-26'), '2026-05-10');
  assert.equal(parseDdMmYy('01/12/24'), '2024-12-01');
});

test('signedIntegerAmount debit/credit', () => {
  assert.equal(signedIntegerAmount(10, 'debit'), -1000);
  assert.equal(signedIntegerAmount(10, 'credit'), 1000);
});

test('signedIntegerAmount rejects invalid type', () => {
  assert.throws(() => signedIntegerAmount(1, 'unknown'), /type must be debit or credit/);
});
