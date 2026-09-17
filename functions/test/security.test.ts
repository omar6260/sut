import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSecret, verifySecret, totpCode, verifyTotp, base32Decode, checkAttempts, USERNAME_RE } from '../src/lib/security.js';

test('PIN : hachage scrypt salé, vérification en temps constant', () => {
  const h = hashSecret('1234');
  assert.ok(verifySecret('1234', h)); assert.ok(!verifySecret('1235', h)); assert.notEqual(h, hashSecret('1234'));
});
test('TOTP : vecteur RFC 6238 (secret "12345678901234567890", t=59 s → 287082)', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 de "12345678901234567890"
  assert.equal(base32Decode(secret).toString(), '12345678901234567890');
  assert.equal(totpCode(secret, 59_000), '287082');
  assert.ok(verifyTotp(secret, totpCode(secret)));
});
test('limitation : 5 tentatives par 15 minutes', () => {
  const now = Date.now();
  assert.equal(checkAttempts([], now).remaining, 5);
  assert.equal(checkAttempts([now - 1000, now - 2000, now - 3000, now - 4000, now - 5000], now).remaining, 0);
  assert.equal(checkAttempts([now - 16 * 60_000], now).remaining, 5);
});
test('nom d’utilisateur : 3 à 30 caractères alphanumériques ou _', () => {
  assert.ok(USERNAME_RE.test('Awa_Dakar')); assert.ok(!USERNAME_RE.test('aw')); assert.ok(!USERNAME_RE.test('a b'));
});
