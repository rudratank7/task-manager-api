/**
 * INTEGRATION TESTS — Health + Auth validation  (src/__tests__/integration/auth.test.ts)
 *
 * These tests use Fastify's `inject()` method to make HTTP requests WITHOUT
 * starting a real network server. This is the recommended Fastify testing pattern.
 *
 * inject() works like a real HTTP request but entirely in-process:
 *   - No ports opened
 *   - Instant (no network latency)
 *   - Runs through the full Fastify pipeline (plugins, hooks, routes, error handler)
 *
 * WHICH TESTS NEED A DATABASE?
 *   Tests marked ⚠️ DB REQUIRED hit the service layer and need DATABASE_URL set.
 *   All other tests fail at Zod validation BEFORE reaching the DB — safe without DB.
 *
 * RUN: npm test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildTestApp } from '../helpers/build-app.js';
import type { FastifyInstance } from 'fastify';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildTestApp(); });
  afterAll(async  () => { await app.close(); });

  it('returns { status: "ok" } with 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({ status: 'ok' });
  });
});

// ── POST /auth/register ────────────────────────────────────────────────────────
describe('POST /auth/register — Zod validation (no DB needed)', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildTestApp(); });
  afterAll(async  () => { await app.close(); });

  it('returns 422 for an invalid email', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/register',
      payload: { orgName: 'Acme', email: 'not-an-email', password: 'secret123' },
    });
    expect(res.statusCode).toBe(422);
    const body = JSON.parse(res.payload);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    // issues should mention the email field
    expect(body.error.issues).toBeInstanceOf(Array);
  });

  it('returns 422 for a short password', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/register',
      payload: { orgName: 'Acme', email: 'admin@acme.com', password: 'abc' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 for an empty orgName', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/register',
      payload: { orgName: '', email: 'admin@acme.com', password: 'secret123' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 for a completely empty body', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/register',
      payload: {},
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── POST /auth/login ───────────────────────────────────────────────────────────
describe('POST /auth/login — Zod validation (no DB needed)', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildTestApp(); });
  afterAll(async  () => { await app.close(); });

  it('returns 422 for missing email', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/login',
      payload: { password: 'secret123' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 for missing password', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/auth/login',
      payload: { email: 'admin@acme.com' },
    });
    expect(res.statusCode).toBe(422);
  });
});

// ── Protected routes — no token ────────────────────────────────────────────────
describe('Protected routes — reject requests without JWT', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildTestApp(); });
  afterAll(async  () => { await app.close(); });

  const protectedRoutes = [
    { method: 'GET',   url: '/projects' },
    { method: 'POST',  url: '/projects' },
    { method: 'GET',   url: '/tasks' },
    { method: 'POST',  url: '/tasks' },
    { method: 'PATCH', url: '/tasks/bulk' },
    { method: 'GET',   url: '/comments' },
    { method: 'POST',  url: '/comments' },
  ] as const;

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} returns 401 without Authorization header`, async () => {
      const res = await app.inject({ method: route.method, url: route.url });
      expect(res.statusCode).toBe(401);
    });
  }
});

// ── Task bulk update — Zod validation (no DB needed) ──────────────────────────
describe('PATCH /tasks/bulk — Zod validation (no DB needed)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();
    // Sign a fake JWT directly — no DB needed, just needs the JWT secret to be set
    token = await app.jwt.sign({ sub: 'fake-id', role: 'admin', orgId: 'fake-org' });
  });
  afterAll(async () => { await app.close(); });

  it('returns 422 when ids is empty', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     '/tasks/bulk',
      headers: { authorization: `Bearer ${token}` },
      payload: { ids: [], status: 'done' },
    });
    expect(res.statusCode).toBe(422);
  });

  it('returns 422 when neither status nor assigneeId is provided', async () => {
    const res = await app.inject({
      method:  'PATCH',
      url:     '/tasks/bulk',
      headers: { authorization: `Bearer ${token}` },
      payload: { ids: ['550e8400-e29b-41d4-a716-446655440000'] },
    });
    expect(res.statusCode).toBe(422);
  });
});
