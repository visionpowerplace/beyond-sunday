import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/**
 * scrypt rather than a bare hash: it is deliberately slow and memory-hard, so
 * a stolen table cannot be ground through at speed. No dependency, and it is
 * in Node already.
 */
export async function hashPassword(plain) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(plain, salt, 64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(plain, stored) {
  const [scheme, salt, hex] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const key = await scryptAsync(plain, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  // Constant time, so a wrong password cannot be found a byte at a time.
  return expected.length === key.length && timingSafeEqual(expected, key);
}
