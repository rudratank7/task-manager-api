/**
 * AUTH VALIDATION SCHEMAS  (src/modules/auth/auth.schema.ts)
 *
 * WHAT IS ZOD?
 * Zod is a TypeScript-first schema library. You define the shape of data
 * (what fields, what types, what constraints), and Zod validates incoming
 * data at runtime. If validation fails, Zod gives you a structured error
 * describing exactly what was wrong.
 *
 * WHY VALIDATE HERE AND NOT IN THE ROUTE?
 * Keeping schemas in a separate file means:
 *   - They can be reused across routes and tests
 *   - The route file stays clean (no big inline objects)
 *   - Types can be inferred from the schema (no duplicate interfaces)
 */

import { z } from 'zod';

// ─── Register ─────────────────────────────────────────────────────────────────
// Creates a NEW organization AND the first admin user.
export const registerSchema = z.object({
  orgName: z.string().min(1, 'Org name is required').max(100),
  email: z.string().email('Must be a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email('Must be a valid email'),
  password: z.string().min(1, 'Password is required'),
});

// ─── Refresh ──────────────────────────────────────────────────────────────────
// Client sends back the refresh token to get a new access token.
export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────
// z.infer<> extracts the TypeScript type from the Zod schema automatically.
// We use these in the service so we don't have to write duplicate interfaces.
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput    = z.infer<typeof loginSchema>;
export type RefreshInput  = z.infer<typeof refreshSchema>;
