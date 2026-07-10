import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { organizations } from './organizations.js';
import { tasks } from './tasks.js';
import { comments } from './comments.js';
import { activityLog } from './activity_logs.js';

export const userRoleEnum = pgEnum('user_role', ['admin', 'member', 'viewer']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // FK index
  index('users_org_id_idx').on(table.orgId),
  // Unique email per organization
  uniqueIndex('users_email_org_unique_idx').on(table.email, table.orgId),
]);

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.orgId],
    references: [organizations.id],
  }),
  assignedTasks: many(tasks),
  comments: many(comments),
  activityLogs: many(activityLog),
}));
