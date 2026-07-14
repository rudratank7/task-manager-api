/**
 * STATUS CONSTANTS  (src/constants/status.ts)
 *
 * Single source of truth for task and project status strings.
 */
export const TASK_STATUS = {
  TODO:        'todo',
  IN_PROGRESS: 'in_progress',
  DONE:        'done',
  ARCHIVED:    'archived',
} as const;

export const TASK_PRIORITY = {
  LOW:    'low',
  MEDIUM: 'medium',
  HIGH:   'high',
  URGENT: 'urgent',
} as const;

export type TaskStatus   = typeof TASK_STATUS[keyof typeof TASK_STATUS];
export type TaskPriority = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];
