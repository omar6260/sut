// Primitives de sécurité côté serveur : hachage scrypt (PIN), TOTP RFC 6238, limitation de tentatives.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashSecret(secret: string, salt = randomBytes(16).toString('hex')): string {
  return salt + ':' + scryptSync(secret, salt, 32).toString('hex');
}
export function verifySecret(secret: string, stored: string): boolean {
  const [salt, hex] = stored.split(':');
  const a = scryptSync(secret, salt, 32);
  const b = Buffer.from(hex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function generateTotpSecret(): string { return base32Encode(randomBytes(20)); }
export function totpCode(secret: string, time = Date.now(), step = 30, digits = 6): string {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / step)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0');
  return code;
}
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  const now = Date.now();
  for (let i = -window; i <= window; i++) if (totpCode(secret, now + i * 30_000) === code) return true;
  return false;
}

/** Fenêtre glissante : `max` tentatives par `windowMs`. Renvoie les tentatives restantes ou lève. */
export function checkAttempts(attempts: number[], now: number, max = 5, windowMs = 15 * 60_000): { recent: number[]; remaining: number } {
  const recent = attempts.filter((t) => now - t < windowMs);
  return { recent, remaining: Math.max(0, max - recent.length) };
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,30}$/;
export const AGE_BRACKETS = new Set(['13-17', '18+']);
