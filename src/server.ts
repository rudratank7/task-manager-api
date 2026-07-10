/**
 * SERVER ENTRY POINT  (src/server.ts)
 *
 * Startup order matters in Fastify:
 *   1. Create instance
 *   2. Global error handler  ← catches AppErrors thrown anywhere in services
 *   3. Plugins               ← jwtPlugin must come before routes that need authenticate
 *   4. Routes                ← each module registered under its own prefix
 *   5. Listen
 */

import Fastify from 'fastify';
import { env } from './config/env.js';
import { AppError } from './lib/errors.js';
import { swaggerPlugin } from './plugins/swagger.js';
import { jwtPlugin } from './plugins/jwt.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';
import { commentsRoutes } from './modules/comments/comments.routes.js';

const start = async () => {
  const app = Fastify({
    logger: {
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  });

  // ── Global Error Handler ───────────────────────────────────────────────────
  // Any AppError thrown in a service bubbles up here automatically.
  // Routes don't need try/catch for expected failures — just throw and let it bubble.
  // Unknown errors are logged and returned as generic 500s.
  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message },
      });
    }

    // Fastify validation errors (should not happen — we use Zod, not Fastify schemas)
    const httpErr = err as { statusCode?: number; message: string };
    if (httpErr.statusCode === 400) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: httpErr.message },
      });
    }

    app.log.error(err);
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });


  // ── Plugins ────────────────────────────────────────────────────────────────
  // IMPORTANT ORDER:
  //   1. swaggerPlugin — must come first; it calls setValidatorCompiler which
  //      must be set before any routes are registered
  //   2. jwtPlugin — adds fastify.authenticate decorator used by route preHandlers
  //   3. Routes — depend on both swagger and jwt being ready
  await app.register(swaggerPlugin);
  await app.register(jwtPlugin);

  // ── Routes ─────────────────────────────────────────────────────────────────
  // Each module is registered under its own URL prefix.
  // Routes inside each module function are RELATIVE to the prefix:
  //   authRoutes:     '/'        → POST /auth/register, /auth/login, /auth/refresh
  //   projectsRoutes: '/'        → GET/POST /projects, GET/PATCH/DELETE /projects/:id
  //   tasksRoutes:    '/bulk'    → PATCH /tasks/bulk
  //                   '/'        → GET/POST /tasks
  //                   '/:id'     → GET/PATCH/DELETE /tasks/:id
  //   commentsRoutes: '/'        → GET/POST /comments
  //                   '/:id'     → DELETE /comments/:id
  await app.register(authRoutes,     { prefix: '/auth' });
  await app.register(projectsRoutes, { prefix: '/projects' });
  await app.register(tasksRoutes,    { prefix: '/tasks' });
  await app.register(commentsRoutes, { prefix: '/comments' });

  // ── Health Check ───────────────────────────────────────────────────────────
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // ── Start Listening ────────────────────────────────────────────────────────
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
