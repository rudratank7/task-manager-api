import bcrypt from 'bcryptjs';

/**
 * HASH UTILS  (src/utils/hash.ts)
 *
 * Thin wrappers around bcryptjs for hashing and comparing passwords.
 * Used exclusively by the auth service.
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function comparePassword(plain: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(plain, hashed);
}
