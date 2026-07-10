import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { tasks } from './tasks.js';
import { users } from './users.js';

export const activityLog = pgTable('activity_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  taskId: uuid('task_id')
    .notNull()
    .references(() => tasks.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('activity_log_task_id_idx').on(table.taskId),
  index('activity_log_user_id_idx').on(table.userId),
]);

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  task: one(tasks, {
    fields: [activityLog.taskId],
    references: [tasks.id],
  }),
  user: one(users, {
    fields: [activityLog.userId],
    references: [users.id],
  }),
}));
