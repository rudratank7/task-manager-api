import Fastify from 'fastify';
import { env } from './config/env.js';
import { swaggerConfig } from './config/swagger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

import { authRoutes } from './routes/auth.routes.js';
import { projectRoutes } from './routes/project.routes.js';
import { taskRoutes } from './routes/task.routes.js';
import { commentRoutes } from './routes/comment.routes.js';

export const app = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
});

// ── Middleware ─────────────────────────────────────────────────────────────────
app.setErrorHandler(errorHandler);
app.register(swaggerConfig);
app.register(authMiddleware);

// ── Routes ────────────────────────────────────────────────────────────────────
app.register(authRoutes,    { prefix: '/auth' });
app.register(projectRoutes, { prefix: '/projects' });
app.register(taskRoutes,    { prefix: '/tasks' });
app.register(commentRoutes, { prefix: '/comments' });

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Root Route → redirect to API docs ────────────────────────────────────────
app.get('/', async (_request, reply) => {
  return reply.redirect('/docs');
});

// ── Silence favicon 404 in browser ───────────────────────────────────────────
app.get('/favicon.ico', async (_request, reply) => {
  return reply.status(204).send();
});
