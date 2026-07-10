import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users.js';

/**
 * WHY THIS TABLE EXISTS:
 * Refresh tokens are long-lived (7 days). If we just gave the client a JWT,
 * we'd have no way to invalidate it before it expires. By storing each token
 * in the DB we can:
 *   1. Mark it as revoked the moment it is used (rotation)
 *   2. Detect reuse attacks — if a revoked token comes in, someone stole it
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),

  // Which user owns this token
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // auto-delete tokens when user is deleted

  // The raw random hex string given to the client (80 hex chars = 40 random bytes)
  token: text('token').notNull().unique(),

  // Hard expiry — even if never revoked, reject after this date
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

  // Set when the token is consumed — null = still valid
  revokedAt: timestamp('revoked_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('refresh_tokens_user_id_idx').on(table.userId), // "get all tokens for user X"
  index('refresh_tokens_token_idx').on(table.token),    // "look up token on refresh"
]);

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));
