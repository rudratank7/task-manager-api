/**
 * ROLES CONSTANTS  (src/constants/roles.ts)
 *
 * Single source of truth for user role strings.
 * Use these instead of hardcoding 'admin' | 'member' | 'viewer' everywhere.
 */
export const ROLES = {
  ADMIN:  'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
