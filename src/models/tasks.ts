import { pgTable, uuid, text, timestamp, pgEnum, integer, index, customType } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { projects } from './projects.js';
import { users } from './users.js';
import { comments } from './comments.js';
import { activityLog } from './activity_logs.js';

export const taskStatusEnum = pgEnum('task_status', ['todo', 'in_progress', 'done', 'archived']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);

// Custom type for PostgreSQL tsvector
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  assigneeId: uuid('assignee_id')
    .references(() => users.id),
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').default('todo').notNull(),
  priority: taskPriorityEnum('priority').default('medium').notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }),
  // Optimistic concurrency control — increment on every update
  version: integer('version').default(1).notNull(),
  // Soft delete — null means active
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  // Full-text search vector (populated via DB trigger or on write)
  searchVector: tsvector('search_vector'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  // FK indexes
  index('tasks_project_id_idx').on(table.projectId),
  index('tasks_assignee_id_idx').on(table.assigneeId),
  // Filter/sort indexes
  index('tasks_status_idx').on(table.status),
  index('tasks_priority_idx').on(table.priority),
  index('tasks_due_date_idx').on(table.dueDate),
  // Soft delete — most queries filter deleted_at IS NULL
  index('tasks_deleted_at_idx').on(table.deletedAt),
  // Full-text search — GIN index for tsvector
  index('tasks_search_vector_gin_idx')
    .using('gin', sql`${table.searchVector}`),
]);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
  }),
  comments: many(comments),
  activityLogs: many(activityLog),
}));
