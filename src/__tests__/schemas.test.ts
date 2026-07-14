/**
 * SCHEMA UNIT TESTS  (src/__tests__/schemas.test.ts)
 *
 * Pure unit tests — no database, no HTTP, no Fastify.
 * Just runs Zod schemas against valid and invalid inputs.
 *
 * WHY TEST SCHEMAS?
 * Schemas define the API contract. If a schema silently accepts an invalid
 * value (e.g. empty string title) or rejects a valid value, every endpoint
 * that uses it is broken. These tests catch schema regressions instantly.
 *
 * RUN: npm test
 */
import { describe, it, expect } from 'vitest';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import {
  createProjectSchema,
  updateProjectSchema,
  listProjectsSchema,
} from '../schemas/projects.schema.js';
import {
  createTaskSchema,
  updateTaskSchema,
  bulkUpdateTaskSchema,
  listTasksSchema,
} from '../schemas/tasks.schema.js';
import {
  createCommentSchema,
  listCommentsSchema,
} from '../schemas/comments.schema.js';

// ─────────────────────────────── AUTH SCHEMAS ─────────────────────────────────

describe('registerSchema', () => {
  const VALID = { orgName: 'Acme Corp', email: 'admin@acme.com', password: 'secret123' };

  it('accepts a valid payload', () => {
    expect(registerSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const r = registerSchema.safeParse({ ...VALID, email: 'not-an-email' });
    expect(r.success).toBe(false);
  });

  it('rejects a password shorter than 8 chars', () => {
    const r = registerSchema.safeParse({ ...VALID, password: 'abc' });
    expect(r.success).toBe(false);
  });

  it('rejects an empty orgName', () => {
    const r = registerSchema.safeParse({ ...VALID, orgName: '' });
    expect(r.success).toBe(false);
  });
});

describe('loginSchema', () => {
  const VALID = { email: 'admin@acme.com', password: 'secret123' };

  it('accepts a valid payload', () => {
    expect(loginSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects missing password', () => {
    const r = loginSchema.safeParse({ email: VALID.email });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────── PROJECT SCHEMAS ──────────────────────────────

describe('createProjectSchema', () => {
  it('accepts name only (description is optional)', () => {
    expect(createProjectSchema.safeParse({ name: 'API v2' }).success).toBe(true);
  });

  it('accepts name + description', () => {
    expect(
      createProjectSchema.safeParse({ name: 'API v2', description: 'Rebuild the API' }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(createProjectSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('requires version field', () => {
    const r = updateProjectSchema.safeParse({ name: 'New name' });
    expect(r.success).toBe(false);
  });

  it('accepts version + optional name', () => {
    expect(updateProjectSchema.safeParse({ name: 'New name', version: 1 }).success).toBe(true);
  });

  it('accepts null description (clears the field)', () => {
    expect(
      updateProjectSchema.safeParse({ description: null, version: 1 }).success,
    ).toBe(true);
  });
});

describe('listProjectsSchema', () => {
  it('uses defaults when query is empty', () => {
    const r = listProjectsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.limit).toBe(20);
    }
  });

  it('coerces string page to number', () => {
    const r = listProjectsSchema.safeParse({ page: '3', limit: '50' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(3);
      expect(r.data.limit).toBe(50);
    }
  });

  it('rejects limit > 100', () => {
    expect(listProjectsSchema.safeParse({ limit: '200' }).success).toBe(false);
  });
});

// ─────────────────────────────── TASK SCHEMAS ─────────────────────────────────

describe('createTaskSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID = { projectId: VALID_UUID, title: 'Fix login bug' };

  it('accepts minimal payload', () => {
    expect(createTaskSchema.safeParse(VALID).success).toBe(true);
  });

  it('rejects invalid projectId (not a UUID)', () => {
    const r = createTaskSchema.safeParse({ ...VALID, projectId: 'abc' });
    expect(r.success).toBe(false);
  });

  it('rejects empty title', () => {
    const r = createTaskSchema.safeParse({ ...VALID, title: '' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid status enum', () => {
    const r = createTaskSchema.safeParse({ ...VALID, status: 'INVALID' });
    expect(r.success).toBe(false);
  });

  it('accepts all valid statuses', () => {
    for (const status of ['todo', 'in_progress', 'done', 'archived']) {
      expect(createTaskSchema.safeParse({ ...VALID, status }).success).toBe(true);
    }
  });

  it('accepts all valid priorities', () => {
    for (const priority of ['low', 'medium', 'high', 'urgent']) {
      expect(createTaskSchema.safeParse({ ...VALID, priority }).success).toBe(true);
    }
  });
});

describe('updateTaskSchema', () => {
  it('requires version', () => {
    expect(updateTaskSchema.safeParse({ status: 'done' }).success).toBe(false);
  });

  it('accepts status update with version', () => {
    expect(updateTaskSchema.safeParse({ status: 'done', version: 1 }).success).toBe(true);
  });

  it('accepts null assigneeId (unassign)', () => {
    expect(updateTaskSchema.safeParse({ assigneeId: null, version: 1 }).success).toBe(true);
  });

  it('accepts null dueDate (clear date)', () => {
    expect(updateTaskSchema.safeParse({ dueDate: null, version: 1 }).success).toBe(true);
  });
});

describe('bulkUpdateTaskSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid ids + status', () => {
    const r = bulkUpdateTaskSchema.safeParse({ ids: [VALID_UUID], status: 'done' });
    expect(r.success).toBe(true);
  });

  it('accepts valid ids + assigneeId', () => {
    const r = bulkUpdateTaskSchema.safeParse({ ids: [VALID_UUID], assigneeId: VALID_UUID });
    expect(r.success).toBe(true);
  });

  it('rejects when neither status nor assigneeId is provided', () => {
    // refine() check — at least one field must be present
    const r = bulkUpdateTaskSchema.safeParse({ ids: [VALID_UUID] });
    expect(r.success).toBe(false);
  });

  it('rejects empty ids array', () => {
    const r = bulkUpdateTaskSchema.safeParse({ ids: [], status: 'done' });
    expect(r.success).toBe(false);
  });

  it('rejects non-UUID in ids', () => {
    const r = bulkUpdateTaskSchema.safeParse({ ids: ['not-a-uuid'], status: 'done' });
    expect(r.success).toBe(false);
  });

  it('rejects more than 100 ids', () => {
    const ids = Array.from({ length: 101 }, () => VALID_UUID);
    const r = bulkUpdateTaskSchema.safeParse({ ids, status: 'done' });
    expect(r.success).toBe(false);
  });
});

describe('listTasksSchema', () => {
  it('uses defaults when query is empty', () => {
    const r = listTasksSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.limit).toBe(20);
      expect(r.data.sortBy).toBe('createdAt');
      expect(r.data.order).toBe('desc');
    }
  });

  it('rejects invalid sortBy', () => {
    const r = listTasksSchema.safeParse({ sortBy: 'title' });
    expect(r.success).toBe(false);
  });

  it('accepts all valid sortBy values', () => {
    for (const sortBy of ['createdAt', 'dueDate', 'priority', 'status']) {
      expect(listTasksSchema.safeParse({ sortBy }).success).toBe(true);
    }
  });
});

// ─────────────────────────────── COMMENT SCHEMAS ──────────────────────────────

describe('createCommentSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid taskId + body', () => {
    expect(
      createCommentSchema.safeParse({ taskId: VALID_UUID, body: 'Looks good!' }).success,
    ).toBe(true);
  });

  it('rejects empty body', () => {
    const r = createCommentSchema.safeParse({ taskId: VALID_UUID, body: '' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid taskId', () => {
    const r = createCommentSchema.safeParse({ taskId: 'abc', body: 'hello' });
    expect(r.success).toBe(false);
  });
});

describe('listCommentsSchema', () => {
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts valid taskId', () => {
    expect(listCommentsSchema.safeParse({ taskId: VALID_UUID }).success).toBe(true);
  });

  it('rejects missing taskId', () => {
    expect(listCommentsSchema.safeParse({}).success).toBe(false);
  });

  it('applies defaults for page and limit', () => {
    const r = listCommentsSchema.safeParse({ taskId: VALID_UUID });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.limit).toBe(20);
    }
  });
});
