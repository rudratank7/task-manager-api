/**
 * PROJECTS ZOD SCHEMAS  (src/modules/projects/projects.schema.ts)
 *
 * Every field constraint is enforced here — routes just call validate() and get typed data.
 * Types are inferred from schemas with z.infer<> so there's zero duplication.
 */
import { z } from 'zod';

// ── GET /projects query params ────────────────────────────────────────────────
// z.coerce.number() → query params arrive as strings; coerce converts '1' → 1
export const listProjectsSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── GET /projects/:id  +  DELETE /projects/:id  params ───────────────────────
export const projectParamsSchema = z.object({
  id: z.string().uuid('Project ID must be a valid UUID'),
});

// ── POST /projects body ───────────────────────────────────────────────────────
export const createProjectSchema = z.object({
  name:        z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
});

// ── PATCH /projects/:id body ──────────────────────────────────────────────────
// version is REQUIRED — used for optimistic concurrency (see service)
// description: nullable() → client can explicitly set it to null to clear it
export const updateProjectSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  version:     z.number().int().positive('version is required'),
});

export type ListProjectsInput  = z.infer<typeof listProjectsSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
